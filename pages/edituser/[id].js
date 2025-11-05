// /pages/edituser/[id].js
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axiosClient from '../../config/axios';
import Swal from 'sweetalert2';
import { ArrowLeft, Save } from 'lucide-react';
import {
  PERMISSIONS_SCHEMA,
  templateForRole,
  emptyPermissions,
} from '../../helpers/permissions';

// Opciones de rol visibles en el form
const ROLE_OPTIONS = [
  { value: 'admin',       label: 'Admin' },
  { value: 'vendedor',    label: 'Vendedor' },
  { value: 'supervisor',  label: 'Supervisor' },
  { value: 'repartidor',  label: 'Repartidor' },
  { value: 'produccion',  label: 'Producción' },
];

// ---------------------------------------------
// helpers de mapeo permisos <-> array backend
// ---------------------------------------------

/**
 * Convierte la lista ["clients:read","orders:update", ...]
 * que trae el backend a la estructura booleana que usamos en el form:
 * {
 *   clients: { view:true, create:false, ... },
 *   clientAccount: { read:true, charge:false },
 *   ...
 * }
 */
function listToPermsObject(list = []) {
  const out = emptyPermissions();

  const has = (k) => {
    const norm = String(k || '').toLowerCase().replace(/\./g, ':');
    return list.some((p) =>
      String(p || '').toLowerCase().replace(/\./g, ':') === norm
    );
  };

  // clients
  out.clients.view   = has('clients:read');
  out.clients.create = has('clients:create');
  out.clients.edit   = has('clients:update');
  out.clients.delete = has('clients:delete');

  // orders
  out.orders.view          = has('orders:read');
  out.orders.create        = has('orders:create');
  out.orders.edit          = has('orders:update');
  out.orders.delete        = has('orders:delete');
  out.orders.markDelivered = has('orders:update'); // mismo permiso que edit/update

  // products
  out.products.view   = has('products:read');
  out.products.create = has('products:create');
  out.products.edit   = has('products:update');
  out.products.delete = has('products:delete');

  // sales
  // tu backend parece agrupar "togglePaid" / "toggleInvoice" bajo sales:update
  const salesCanUpdate = has('sales:update');
  out.sales.view          = has('sales:read') || salesCanUpdate;
  out.sales.togglePaid    = salesCanUpdate;
  out.sales.toggleInvoice = salesCanUpdate;

  // clientAccount (pantalla /client/[id]/account)
  out.clientAccount.read   = has('client.account.read');
  out.clientAccount.charge = has('client.account.charge');

  // users
  out.users.view   = has('users:read');
  out.users.create = has('users:create');
  out.users.edit   = has('users:update');
  out.users.delete = has('users:delete');

  return out;
}

/**
 * Hace lo contrario: del objeto booleans del form a la lista "flat"
 * que vamos a mandar a patch.perms.
 *
 * Ej: { clients:{view:true,edit:false,...}, clientAccount:{read:true,...} }
 *  -> ['clients:read','client.account.read', ...]
 */
function permsObjectToList(permsObj = {}) {
  const result = [];

  // clients
  if (permsObj.clients?.view)   result.push('clients:read');
  if (permsObj.clients?.create) result.push('clients:create');
  if (permsObj.clients?.edit)   result.push('clients:update');
  if (permsObj.clients?.delete) result.push('clients:delete');

  // orders
  if (permsObj.orders?.view)          result.push('orders:read');
  if (permsObj.orders?.create)        result.push('orders:create');
  if (permsObj.orders?.edit)          result.push('orders:update');
  if (permsObj.orders?.delete)        result.push('orders:delete');
  if (permsObj.orders?.markDelivered) result.push('orders:update'); // mismo permiso

  // products
  if (permsObj.products?.view)   result.push('products:read');
  if (permsObj.products?.create) result.push('products:create');
  if (permsObj.products?.edit)   result.push('products:update');
  if (permsObj.products?.delete) result.push('products:delete');

  // sales
  // si puede marcar pagado/factura => sales:update
  const salesNeedsUpdate =
    permsObj.sales?.togglePaid ||
    permsObj.sales?.toggleInvoice;
  if (permsObj.sales?.view || salesNeedsUpdate) {
    // 'sales:read' para ver listado/cobranzas
    result.push('sales:read');
  }
  if (salesNeedsUpdate) {
    result.push('sales:update');
  }

  // clientAccount
  if (permsObj.clientAccount?.read) {
    result.push('client.account.read');
  }
  if (permsObj.clientAccount?.charge) {
    result.push('client.account.charge');
  }

  // users
  if (permsObj.users?.view)   result.push('users:read');
  if (permsObj.users?.create) result.push('users:create');
  if (permsObj.users?.edit)   result.push('users:update');
  if (permsObj.users?.delete) result.push('users:delete');

  // Limpieza: quitar duplicados
  return Array.from(new Set(result));
}

// ---------------------------------------------
// componente principal
// ---------------------------------------------
const EditUser = () => {
  const router = useRouter();
  const { id } = router.query;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // cargar usuario
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const res = await axiosClient.get(`users/${id}`); // backend debe aceptar id numérico o uuid
        setUser(res.data);
      } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Usuario no encontrado.', 'error');
        router.push('/users');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  // permisos iniciales para el form
  const initialPerms = useMemo(() => {
    if (!user) return templateForRole('vendedor');

    const roleLower = String(user.role || '').toLowerCase();

    // Si el usuario es admin: parte con la plantilla admin (todo true).
    // OJO: ahora igual vas a poder tildar / destildar en pantalla.
    if (roleLower === 'admin') {
      return templateForRole('admin'); // all true
    }

    // Para otros roles:
    // - si backend trae array de permisos => lo usamos
    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
      return listToPermsObject(user.permissions);
    }

    // - si no trae nada => usamos la plantilla por rol
    return templateForRole(roleLower || 'vendedor');
  }, [user]);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      name: user?.name || '',
      email: user?.email || '',
      role: (user?.role || 'vendedor').toLowerCase(),
      partnerTag: user?.partner_tag || user?.partnerTag || '',
      newPassword: '',
      confirmPassword: '',
      permissions: initialPerms,
      canDeliver: !!(user?.can_deliver ?? user?.canDeliver),
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      role: Yup.string()
        .oneOf(ROLE_OPTIONS.map((r) => r.value))
        .required('El rol es obligatorio'),
      partnerTag: Yup.string().max(30, 'Máx 30 caracteres'),
      newPassword: Yup.string().min(4, 'Mínimo 4 caracteres').notRequired(),
      confirmPassword: Yup.string().oneOf(
        [Yup.ref('newPassword'), ''],
        'Las contraseñas no coinciden'
      ),
    }),
    onSubmit: async (values) => {
      try {
        setSubmitting(true);

        // 1. Convertir los flags de permisos en la lista flat
        let permsList = permsObjectToList(values.permissions || emptyPermissions());

        // 2. Si el rol es admin -> forzamos TODOS los permisos igual antes de mandar
        //    Esto asegura que el admin en BD siempre queda full acceso.
        if (values.role === 'admin') {
          const full = templateForRole('admin'); // todo true
          permsList = permsObjectToList(full);
        }

        const patch = {
          name: values.name,
          email: values.email,
          role: values.role,
          partnerTag: values.partnerTag || '',
          perms: permsList,
          canDeliver: !!values.canDeliver,
        };

        if (values.newPassword?.trim()) {
          patch.password = values.newPassword.trim();
        }

        await axiosClient.patch(`users/${id}`, patch);

        await Swal.fire('Guardado', 'Usuario actualizado correctamente.', 'success');
        router.push('/users');
      } catch (e) {
        console.error(e);
        Swal.fire(
          'Error',
          e?.response?.data?.error || 'No se pudo actualizar el usuario.',
          'error'
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Cambiar rol desde el select
  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    formik.setFieldValue('role', newRole);

    // Resetea permisos base según el rol elegido
    const tpl = templateForRole(newRole);
    formik.setFieldValue('permissions', tpl);

    // Si es repartidor, forzamos canDeliver = true
    if (newRole === 'repartidor') {
      formik.setFieldValue('canDeliver', true);
    }
  };

  // Toggle de cada checkbox de permiso
  const togglePerm = (mod, action) => {
    const next = { ...(formik.values.permissions || {}) };
    next[mod] = { ...(next[mod] || {}) };
    next[mod][action] = !next[mod][action];
    formik.setFieldValue('permissions', next);
  };

  const renderError = (id) =>
    formik.touched[id] && formik.errors[id] ? (
      <p className="mt-1 text-xs text-rose-600">{formik.errors[id]}</p>
    ) : null;

  // IMPORTANTE:
  // Ya NO bloqueamos los permisos cuando role === 'admin'.
  // Antes teníamos algo tipo `const permsDisabled = formik.values.role === 'admin'`
  // y se aplicaba disabled={permsDisabled}. Eso se fue.
  const permsDisabled = false;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-coffee">
          Editar <span className="text-brand-600">Usuario</span>
        </h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-coffee hover:bg-gray-50"
          title="Atrás"
        >
          <ArrowLeft size={16} />
          Atrás
        </button>
      </div>

      {loading && <p className="text-gray-600">Cargando usuario…</p>}

      {!loading && user && (
        <form
          onSubmit={formik.handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm max-w-3xl"
          noValidate
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">Nombre</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
                {...formik.getFieldProps('name')}
              />
              {renderError('name')}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
                {...formik.getFieldProps('email')}
              />
              {renderError('email')}
            </div>

            {/* Rol */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">Rol</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:ring-1 focus:ring-brand-500"
                value={formik.values.role}
                onChange={handleRoleChange}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {renderError('role')}
            </div>

            {/* Etiqueta de socio */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">
                Etiqueta de socio (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Cecil"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
                {...formik.getFieldProps('partnerTag')}
              />
              {renderError('partnerTag')}
            </div>

            {/* Nueva contraseña */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">Nueva contraseña</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
                {...formik.getFieldProps('newPassword')}
                placeholder="Dejar en blanco para no cambiar"
              />
              {renderError('newPassword')}
            </div>

            {/* Confirmar */}
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">
                Confirmar contraseña
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
                {...formik.getFieldProps('confirmPassword')}
                placeholder="Repite la nueva contraseña"
              />
              {renderError('confirmPassword')}
            </div>

            {/* Puede repartir */}
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm mt-2">
                <input
                  type="checkbox"
                  checked={formik.values.canDeliver || false}
                  onChange={(e) => formik.setFieldValue('canDeliver', e.target.checked)}
                />
                Puede repartir (aparece en “Repartidor asignado”)
              </label>
            </div>
          </div>

          {/* Permisos */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-coffee">Permisos</h2>
              {formik.values.role === 'admin' && (
                <span className="text-xs text-gray-500">
                  Admin guarda todos los permisos al confirmar.
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(PERMISSIONS_SCHEMA).map(([mod, def]) => (
                <div key={mod} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-sm font-medium text-coffee mb-2">{def.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(def.actions).map(([key, label]) => {
                      const checked = !!formik.values.permissions?.[mod]?.[key];
                      return (
                        <label
                          key={key}
                          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs ${
                            checked
                              ? 'bg-brand-50 border-brand-200 text-brand-700'
                              : 'bg-white border-gray-300 text-coffee hover:bg-gray-50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="accent-indigo-600"
                            checked={checked}
                            onChange={() => togglePerm(mod, key)}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/users')}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-coffee hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-60"
            >
              <Save size={16} />
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}
    </Layout>
  );
};

export default EditUser;
