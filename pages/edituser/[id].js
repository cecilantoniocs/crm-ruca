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

const ROLE_OPTIONS = [
  { value: 'admin',       label: 'Admin' },
  { value: 'vendedor',    label: 'Vendedor' },
  { value: 'supervisor',  label: 'Supervisor' },
  { value: 'repartidor',  label: 'Repartidor' },
  { value: 'produccion',  label: 'Producción' },
];

/** Lista (['clients:read', ...]) -> objeto de toggles compatible con PERMISSIONS_SCHEMA */
function listToPermsObject(list = []) {
  const out = emptyPermissions();

  const has = (k) => {
    const norm = String(k || '').toLowerCase().replace(/\./g, ':');
    return list.some((p) => String(p || '').toLowerCase().replace(/\./g, ':') === norm);
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
  out.orders.markDelivered = has('orders:update');

  // products
  out.products.view   = has('products:read');
  out.products.create = has('products:create');
  out.products.edit   = has('products:update');
  out.products.delete = has('products:delete');

  // sales (ambos toggles mapean a sales:update)
  const salesCanUpdate = has('sales:update');
  out.sales.view         = has('sales:read') || salesCanUpdate;
  out.sales.togglePaid   = salesCanUpdate;
  out.sales.toggleInvoice= salesCanUpdate;

  // users (admite ":" o ".")
  out.users.view   = has('users:read');
  out.users.create = has('users:create');
  out.users.edit   = has('users:update');
  out.users.delete = has('users:delete');

  return out;
}

const EditUser = () => {
  const router = useRouter();
  const { id } = router.query;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const res = await axiosClient.get(`users/${id}`); // acepta uuid o email codificado
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

  const initialPerms = useMemo(() => {
    if (!user) return templateForRole('vendedor');
    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
      return listToPermsObject(user.permissions);
    }
    return templateForRole(user.role || 'vendedor');
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
      role: Yup.string().oneOf(ROLE_OPTIONS.map((r) => r.value)).required('El rol es obligatorio'),
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
        const patch = {
          name: values.name,
          email: values.email,
          role: values.role,                       // backend lo normaliza/valida
          partnerTag: values.partnerTag || '',
          perms: values.permissions || emptyPermissions(),
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
        Swal.fire('Error', e?.response?.data?.error || 'No se pudo actualizar el usuario.', 'error');
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    formik.setFieldValue('role', newRole);
    formik.setFieldValue('permissions', templateForRole(newRole));
    // Si es repartidor, forzamos canDeliver = true
    if (newRole === 'repartidor') {
      formik.setFieldValue('canDeliver', true);
    }
  };

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

  const permsDisabled = formik.values.role === 'admin';

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
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">Nombre</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
                {...formik.getFieldProps('name')}
              />
              {renderError('name')}
            </div>

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

            {/* Cambio de contraseña (opcional) */}
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
            <div>
              <label className="block text-sm font-medium text-coffee mb-1">Confirmar contraseña</label>
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
                  El rol <b>Admin</b> tiene todos los permisos.
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
                      const disabled = permsDisabled;
                      return (
                        <label
                          key={key}
                          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs ${
                            checked ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-gray-300 text-coffee'
                          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                        >
                          <input
                            type="checkbox"
                            className="accent-indigo-600"
                            checked={checked}
                            onChange={() => !disabled && togglePerm(mod, key)}
                            disabled={disabled}
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
