import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import Swal from 'sweetalert2';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Save } from 'lucide-react';
import {
  PERMISSIONS_SCHEMA,
  templateForRole,
  emptyPermissions,
} from '../helpers/permissions';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'repartidor', label: 'Repartidor' },
  { value: 'supervisor', label: 'Supervisor' },
];

const NewUser = () => {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const formik = useFormik({
    initialValues: {
      name: '',
      email: '',
      password: '',
      role: 'vendedor',
      partnerTag: '',
      permissions: templateForRole('vendedor'), // se puede ajustar manualmente
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      password: Yup.string().min(4, 'Mínimo 4 caracteres').required('La contraseña es obligatoria'),
      role: Yup.string().required('El rol es obligatorio'),
      partnerTag: Yup.string().max(30, 'Máx 30 caracteres'),
    }),
    onSubmit: async (values) => {
      try {
        setSubmitting(true);
        const payload = {
          id: uuidv4(),
          name: values.name,
          email: values.email,
          password: values.password, // json-server ⇒ texto plano
          role: values.role,
          partnerTag: values.partnerTag || '',
          perms: values.permissions || emptyPermissions(),
        };
        await axiosClient.post('users', payload);
        await Swal.fire('Usuario creado', 'El usuario se registró correctamente.', 'success');
        router.push('/users');
      } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo crear el usuario.', 'error');
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Si el rol cambia, aplicamos la plantilla de permisos del rol
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Crear <span className="text-indigo-600">Usuario</span>
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

      <form
        onSubmit={formik.handleSubmit}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm max-w-3xl"
        noValidate
      >
        {/* Datos básicos */}
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

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type={showPwd ? 'text' : 'password'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm focus:ring-1 focus:ring-indigo-500"
              {...formik.getFieldProps('password')}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-8 text-xs text-gray-600 hover:text-gray-800"
              title={showPwd ? 'Ocultar' : 'Mostrar'}
            >
              {showPwd ? 'Ocultar' : 'Mostrar'}
            </button>
            {renderError('password')}
          </div>

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

          <div className="md:col-span-2">
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
        </div>

        {/* Permisos por módulo */}
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
            {submitting ? 'Guardando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Layout>
  );
};

export default NewUser;
