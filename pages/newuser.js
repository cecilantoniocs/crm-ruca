// /pages/newuser.js
import React from 'react';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axiosClient from '../config/axios';
import Swal from 'sweetalert2';
import { ArrowLeft, UserPlus } from 'lucide-react';
import {
  PERMISSIONS_SCHEMA,
  templateForRole,
  emptyPermissions,
} from '../helpers/permissions';

const ROLE_OPTIONS = [
  { value: 'admin',       label: 'Admin' },
  { value: 'vendedor',    label: 'Vendedor' },
  { value: 'supervisor',  label: 'Supervisor' },
  { value: 'repartidor',  label: 'Repartidor' },
  { value: 'produccion',  label: 'Producción' },
];

const CARTERAS_OPTIONS = [
  { value: 'rucapellan', label: 'Rucapellán' },
  { value: 'cecil',      label: 'Cecil' },
];

export default function NewUser() {
  const router = useRouter();

  const formik = useFormik({
    initialValues: {
      name: '',
      email: '',
      role: 'vendedor',
      carteras: [],
      password: '',
      confirmPassword: '',
      permissions: templateForRole('vendedor'),
      canDeliver: false,
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      role: Yup.string().oneOf(ROLE_OPTIONS.map((r) => r.value)).required('El rol es obligatorio'),
      password: Yup.string().min(4, 'Mín 4 caracteres').required('Requerida'),
      confirmPassword: Yup.string().oneOf([Yup.ref('password')], 'No coincide'),
    }),
    onSubmit: async (values) => {
      try {
        const payload = {
          name: values.name,
          email: values.email,
          role: values.role,
          carteras: values.role === 'admin' ? ['rucapellan', 'cecil'] : values.carteras,
          password: values.password,
          perms: values.permissions || emptyPermissions(),
          canDeliver: !!values.canDeliver,
        };
        await axiosClient.post('users', payload);
        await Swal.fire('Creado', 'Usuario creado correctamente.', 'success');
        router.push('/users');
      } catch (e) {
        console.error(e);
        Swal.fire('Error', e?.response?.data?.error || 'No se pudo crear el usuario.', 'error');
      }
    },
  });

  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    formik.setFieldValue('role', newRole);
    formik.setFieldValue('permissions', templateForRole(newRole));
    if (newRole === 'admin') {
      formik.setFieldValue('carteras', ['rucapellan', 'cecil']);
    }
    if (newRole === 'repartidor') {
      formik.setFieldValue('canDeliver', true);
    }
  };

  const toggleCartera = (val) => {
    const current = formik.values.carteras || [];
    const next = current.includes(val)
      ? current.filter((c) => c !== val)
      : [...current, val];
    formik.setFieldValue('carteras', next);
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
          Nuevo <span className="text-brand-600">Usuario</span>
        </h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-coffee hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          Atrás
        </button>
      </div>

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
            <label className="block text-sm font-medium text-coffee mb-1">Carteras</label>
            <div className="flex gap-3 mt-1">
              {CARTERAS_OPTIONS.map((c) => {
                const checked = (formik.values.carteras || []).includes(c.value);
                const isAdminRole = formik.values.role === 'admin';
                return (
                  <label
                    key={c.value}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                      checked || isAdminRole
                        ? 'bg-brand-50 border-brand-200 text-brand-700'
                        : 'bg-white border-gray-300 text-coffee hover:bg-gray-50'
                    } ${isAdminRole ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={checked || isAdminRole}
                      onChange={() => !isAdminRole && toggleCartera(c.value)}
                      disabled={isAdminRole}
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee mb-1">Contraseña</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
              {...formik.getFieldProps('password')}
            />
            {renderError('password')}
          </div>
          <div>
            <label className="block text-sm font-medium text-coffee mb-1">Confirmar contraseña</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500"
              {...formik.getFieldProps('confirmPassword')}
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
            <div className="text-sm font-semibold text-coffee">Permisos</div>
            {permsDisabled && (
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
                    return (
                      <label
                        key={key}
                        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs ${
                          checked
                            ? 'bg-brand-50 border-brand-200 text-brand-700'
                            : 'bg-white border-gray-300 text-coffee'
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
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-coffee hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700"
          >
            <UserPlus size={16} />
            Crear usuario
          </button>
        </div>
      </form>
    </Layout>
  );
}
