import React, { useEffect, useState } from 'react';
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
  { value: 'admin', label: 'Admin' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'repartidor', label: 'Repartidor' },
  { value: 'supervisor', label: 'Supervisor' },
];

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
        const res = await axiosClient.get(`users/${id}`);
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

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || 'vendedor',
      partnerTag: user?.partnerTag || '',
      // cambio de contraseña opcional
      newPassword: '',
      confirmPassword: '',
      permissions: user?.perms || templateForRole(user?.role || 'vendedor'),
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      role: Yup.string().required('El rol es obligatorio'),
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
          role: values.role,
          partnerTag: values.partnerTag || '',
          perms: values.permissions || emptyPermissions(),
        };
        if (values.newPassword?.trim()) {
          patch.password = values.newPassword.trim();
        }
        await axiosClient.patch(`users/${id}`, patch);
        await Swal.fire('Guardado', 'Usuario actualizado correctamente.', 'success');
        router.push('/users');
      } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo actualizar el usuario.', 'error');
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    formik.setFieldValue('role', newRole);
    formik.setFieldValue('permissions', templateForRole(newRole));
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
        <h1 className="text-2xl font-bold text-gray-800">
          Editar <span className="text-indigo-600">Usuario</span>
        </h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                {...formik.getFieldProps('name')}
              />
              {renderError('name')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                {...formik.getFieldProps('email')}
              />
              {renderError('email')}
            </div>

            {/* Rol */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:ring-1 focus:ring-indigo-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Etiqueta de socio (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Cecil"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                {...formik.getFieldProps('partnerTag')}
              />
              {renderError('partnerTag')}
            </div>

            {/* Cambio de contraseña (opcional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                {...formik.getFieldProps('newPassword')}
                placeholder="Dejar en blanco para no cambiar"
              />
              {renderError('newPassword')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                {...formik.getFieldProps('confirmPassword')}
                placeholder="Repite la nueva contraseña"
              />
              {renderError('confirmPassword')}
            </div>
          </div>

          {/* Permisos */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-800">Permisos</h2>
              {permsDisabled && (
                <span className="text-xs text-gray-500">
                  El rol <b>Admin</b> tiene todos los permisos.
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(PERMISSIONS_SCHEMA).map(([mod, def]) => (
                <div key={mod} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-sm font-medium text-gray-800 mb-2">{def.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(def.actions).map(([key, label]) => {
                      const checked = !!formik.values.permissions?.[mod]?.[key];
                      return (
                        <label
                          key={key}
                          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs ${
                            checked ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-300 text-gray-700'
                          } ${permsDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                        >
                          <input
                            type="checkbox"
                            className="accent-indigo-600"
                            checked={checked}
                            onChange={() => !permsDisabled && togglePerm(mod, key)}
                            disabled={permsDisabled}
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
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-60"
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
