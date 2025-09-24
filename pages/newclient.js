// pages/newclient.js
import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import Swal from 'sweetalert2';
import { getCurrentSeller } from '../helpers';
import { ArrowLeft, UserPlus } from 'lucide-react';

const normalizeRut = (raw) => {
  if (!raw) return '';
  const clean = raw.replace(/\./g, '').replace(/[^0-9kK-]/g, '').toUpperCase();
  if (!clean.includes('-') && clean.length > 1) {
    const cuerpo = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${cuerpo}-${dv}`;
  }
  return clean;
};

const validateRutBasic = (rut) => {
  if (!rut) return true;
  return /^\d{7,8}-[\dK]$/.test(rut);
};

function InputField({ formik, id, label, type = 'text', onChange, onBlur, ...rest }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={label}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm"
        onChange={onChange ?? formik.handleChange}
        onBlur={onBlur ?? formik.handleBlur}
        value={formik.values[id]}
        autoComplete="off"
        {...rest}
      />
      {formik.touched[id] && formik.errors[id] && (
        <p className="mt-1 text-xs text-rose-600">{formik.errors[id]}</p>
      )}
    </div>
  );
}

function PhoneInput({ formik }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
      <div className="flex">
        <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-600">
          +56
        </span>
        <input
          id="telefono"
          name="telefono"
          type="tel"
          inputMode="numeric"
          maxLength={9}
          placeholder="9 dígitos"
          className="w-full rounded-r-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm"
          value={formik.values.telefono}
          onChange={(e) => {
            const digitsOnly = e.target.value.replace(/\D/g, '');
            formik.setFieldValue('telefono', digitsOnly);
          }}
          onBlur={formik.handleBlur}
          autoComplete="off"
        />
      </div>
      {formik.touched.telefono && formik.errors.telefono && (
        <p className="mt-1 text-xs text-rose-600">{formik.errors.telefono}</p>
      )}
    </div>
  );
}

const NewClient = () => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formik = useFormik({
    initialValues: {
      name: '',
      nombre_local: '',
      dir1: '',
      zona: '',
      ciudad: '',
      telefono: '',
      email: '',
      rut: '',
      razon_social: '',
      clientType: 'b2b',     // default B2B
      clientOwner: '',       // requerido, empieza vacío
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      nombre_local: Yup.string().required('El nombre del local es obligatorio'),
      dir1: Yup.string().required('La dirección es obligatoria'),
      zona: Yup.string().required('La zona es obligatoria'),
      ciudad: Yup.string().required('La ciudad es obligatoria'),
      telefono: Yup.string().matches(/^\d+$/, 'Solo números').min(8, 'Muy corto').max(9, 'Muy largo').required('El teléfono es obligatorio'),
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      rut: Yup.string().test('rut-basic', 'RUT inválido (ej: 12345678-9)', validateRutBasic),
      razon_social: Yup.string(),
      clientType: Yup.mixed().oneOf(['b2b','b2c']).required(),
      clientOwner: Yup.mixed().oneOf(['rucapellan','cecil'], 'Selecciona una opción').required('Asignado a es obligatorio'),
    }),
    onSubmit: async (val) => {
      try {
        setIsSubmitting(true);
        const seller = getCurrentSeller?.();
        if (!seller?.id) {
          await Swal.fire('Error', 'No se encontró el vendedor actual', 'error');
          return;
        }
        const telefonoFull = `+56${val.telefono}`;
        const payload = {
          ...val,
          telefono: telefonoFull,
          rut: normalizeRut(val.rut),
          sellerId: seller.id,
          // normalizamos por si vinieran capitalizadas
          clientType: String(val.clientType || 'b2b').toLowerCase(),
          clientOwner: String(val.clientOwner || '').toLowerCase(),
        };

        await axiosClient.post('clients', payload);

        await Swal.fire('¡Cliente creado!', 'El cliente ha sido registrado con éxito.', 'success');
        router.push('/client');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', error?.response?.data?.error || 'No se pudo crear el cliente.', 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-coffee tracking-tight">
          Nuevo <span className="text-brand-600">Cliente</span>
        </h1>

        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition"
          title="Atrás"
          aria-label="Atrás"
        >
          <ArrowLeft size={16} />
          Atrás
        </button>
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <form className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm" onSubmit={formik.handleSubmit} noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField formik={formik} id="name" label="Nombre" />
            <InputField formik={formik} id="nombre_local" label="Nombre del local" />
            <InputField formik={formik} id="dir1" label="Dirección" />
            <InputField formik={formik} id="zona" label="Zona" />
            <InputField formik={formik} id="ciudad" label="Ciudad" />
            <div className="md:col-span-2">
              <PhoneInput formik={formik} />
            </div>
            <div className="md:col-span-2">
              <InputField formik={formik} id="email" label="Correo electrónico" type="email" />
            </div>

            {/* Tipo de cliente */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cliente</label>
              <select
                id="clientType"
                name="clientType"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm bg-white"
                value={formik.values.clientType}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              >
                <option value="b2b">B2B</option>
                <option value="b2c">B2C</option>
              </select>
              {formik.touched.clientType && formik.errors.clientType && (
                <p className="mt-1 text-xs text-rose-600">{formik.errors.clientType}</p>
              )}
            </div>

            {/* Asignado a (obligatorio, inicia vacío) */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Asignado a</label>
              <select
                id="clientOwner"
                name="clientOwner"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm bg-white"
                value={formik.values.clientOwner}
                onChange={(e) => formik.setFieldValue('clientOwner', e.target.value)}
                onBlur={formik.handleBlur}
              >
                <option value="">{'— Selecciona —'}</option>
                <option value="rucapellan">Rucapellan</option>
                <option value="cecil">Cecil</option>
              </select>
              {formik.touched.clientOwner && formik.errors.clientOwner && (
                <p className="mt-1 text-xs text-rose-600">{formik.errors.clientOwner}</p>
              )}
            </div>

            {/* Opcionales */}
            <InputField
              formik={formik}
              id="rut"
              label="RUT (sin puntos, con guion)"
              onBlur={(e) => {
                const v = normalizeRut(e.target.value);
                formik.setFieldValue('rut', v);
                formik.handleBlur(e);
              }}
            />
            <InputField formik={formik} id="razon_social" label="Razón social" />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/client')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition"
              title="Cancelar"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition"
              title="Crear cliente"
            >
              <UserPlus size={16} />
              {isSubmitting ? 'Creando…' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default NewClient;
