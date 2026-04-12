// pages/editclient/[id].js
import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axiosClient from '../../config/axios';
import Swal from 'sweetalert2';
import { ArrowLeft, Save, Clock, User } from 'lucide-react';

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const normalizePhoneCL = (val) => {
  if (!val) return '';
  const digits = val.replace(/[^\d]/g, '');
  if (val.startsWith('+56')) return `+56${digits.replace(/^56/, '').replace(/^0+/, '')}`;
  if (val.startsWith('56'))  return `+56${digits.replace(/^56/, '').replace(/^0+/, '')}`;
  return `+56${digits.replace(/^0+/, '')}`;
};
const phoneToDigitsCL = (val) => (!val ? '' : val.replace(/[^\d]/g, '').replace(/^56/, ''));
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
const validateRutBasic = (rut) => (!rut ? true : /^\d{7,8}-[\dK]$/.test(rut));

const EditClient = () => {
  const router = useRouter();
  const { id } = router.query;

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const res = await axiosClient.get(`clients/${id}`);
        setClient(res.data);
      } catch (err) {
        console.error(err);
        setLoadError(
          err?.response?.status === 404 ? 'Cliente no encontrado.' : 'Error al cargar el cliente.'
        );
        setClient(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      name: client?.name || '',
      nombre_local: client?.nombre_local || '',
      dir1: client?.dir1 || '',
      zona: client?.zona || '',
      ciudad: client?.ciudad || '',
      telefono: phoneToDigitsCL(client?.telefono || ''),
      email: client?.email || '',
      rut: client?.rut || '',
      razon_social: client?.razon_social || '',
      clientType: (client?.clientType || client?.client_type || 'b2b'),
      clientOwner: client?.clientOwner || client?.client_owner || '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      nombre_local: Yup.string().required('El nombre del local es obligatorio'),
      dir1: Yup.string().required('La dirección es obligatoria'),
      zona: Yup.string().required('La zona es obligatoria'),
      ciudad: Yup.string().required('La ciudad es obligatoria'),
      telefono: Yup.string().matches(/^\d+$/, 'Solo números').min(8, 'Muy corto').max(9, 'Muy largo').required('El teléfono es obligatorio'),
      // EMAIL OPCIONAL:
      email: Yup.string().email('Email inválido').nullable(),
      rut: Yup.string().test('rut-basic', 'RUT inválido (ej: 12345678-9)', validateRutBasic),
      razon_social: Yup.string(),
      clientType: Yup.mixed().oneOf(['b2b','b2c']).required(),
      clientOwner: Yup.mixed().oneOf(['rucapellan','cecil'], 'Selecciona una opción').required('Asignado a es obligatorio'),
    }),
    onSubmit: async (val) => {
      try {
        setIsSubmitting(true);
        const telefonoFull = normalizePhoneCL(`+56${val.telefono}`);

        const payload = {
          ...val,
          telefono: telefonoFull,
          rut: normalizeRut(val.rut),
          clientType: val.clientType,
          clientOwner: val.clientOwner ? String(val.clientOwner).toLowerCase() : null,
          // si email vacío -> null
          email: val.email && val.email.trim() ? val.email.trim().toLowerCase() : null,
        };

        await axiosClient.patch(`clients/${id}`, payload);
        await Swal.fire('Editado', 'Cliente actualizado correctamente.', 'success');
        router.push('/client');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', error?.response?.data?.error || 'No se pudo actualizar el cliente.', 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-coffee-900">
          Editar <span className="text-brand-700">Cliente</span>
        </h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-coffee-900 hover:bg-gray-50 active:scale-95 transition"
        >
          <ArrowLeft size={16} />
          Atrás
        </button>
      </div>

      {loading && <p className="text-gray-600">Cargando cliente…</p>}
      {!loading && loadError && <p className="text-rose-600">{loadError}</p>}

      {!loading && !loadError && client && (
        <div className="mx-auto w-full max-w-2xl">
          <form
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            onSubmit={formik.handleSubmit}
            noValidate
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Nombre</label>
                <input
                  id="name"
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('name')}
                />
                {formik.touched.name && formik.errors.name && <p className="mt-1 text-xs text-rose-600">{formik.errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Nombre del local</label>
                <input
                  id="nombre_local"
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('nombre_local')}
                />
                {formik.touched.nombre_local && formik.errors.nombre_local && <p className="mt-1 text-xs text-rose-600">{formik.errors.nombre_local}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Dirección</label>
                <input
                  id="dir1"
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('dir1')}
                />
                {formik.touched.dir1 && formik.errors.dir1 && <p className="mt-1 text-xs text-rose-600">{formik.errors.dir1}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Zona</label>
                <input
                  id="zona"
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('zona')}
                />
                {formik.touched.zona && formik.errors.zona && <p className="mt-1 text-xs text-rose-600">{formik.errors.zona}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Ciudad</label>
                <input
                  id="ciudad"
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('ciudad')}
                />
                {formik.touched.ciudad && formik.errors.ciudad && <p className="mt-1 text-xs text-rose-600">{formik.errors.ciudad}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-coffee-900 mb-1">Teléfono</label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-600">+56</span>
                  <input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    inputMode="numeric"
                    maxLength={9}
                    className="w-full rounded-r-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    value={formik.values.telefono}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '');
                      formik.setFieldValue('telefono', digitsOnly);
                    }}
                    onBlur={formik.handleBlur}
                    autoComplete="off"
                  />
                </div>
                {formik.touched.telefono && formik.errors.telefono && <p className="mt-1 text-xs text-rose-600">{formik.errors.telefono}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-coffee-900 mb-1">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('email')}
                />
                {formik.touched.email && formik.errors.email && <p className="mt-1 text-xs text-rose-600">{formik.errors.email}</p>}
              </div>

              {/* Tipo de cliente */}
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Tipo de cliente</label>
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

              {/* Asignado a */}
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Asignado a</label>
                <select
                  id="clientOwner"
                  name="clientOwner"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-sm bg-white"
                  value={formik.values.clientOwner}
                  onChange={(e) => formik.setFieldValue('clientOwner', e.target.value)}
                  onBlur={formik.handleBlur}
                  required
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
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">RUT (sin puntos, con guion)</label>
                <input
                  id="rut"
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  value={formik.values.rut}
                  onChange={formik.handleChange}
                  onBlur={(e) => {
                    const v = normalizeRut(e.target.value);
                    formik.setFieldValue('rut', v);
                    formik.handleBlur(e);
                  }}
                />
                {formik.touched.rut && formik.errors.rut && <p className="mt-1 text-xs text-rose-600">{formik.errors.rut}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">Razón social (opcional)</label>
                <input
                  id="razon_social"
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('razon_social')}
                />
              </div>
            </div>

            {/* Metadata */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Clock size={13} className="shrink-0" />
                Creado: <span className="text-gray-500 font-medium">{fmtDateTime(client?.createdAt)}</span>
              </span>
              <span className="text-gray-200">|</span>
              <span>Modificado: <span className="text-gray-500 font-medium">{fmtDateTime(client?.updatedAt)}</span></span>
              {client?.createdByName && (
                <>
                  <span className="text-gray-200">|</span>
                  <span className="flex items-center gap-1">
                    <User size={13} className="shrink-0" />
                    Creado por: <span className="text-gray-500 font-medium">{client.createdByName}</span>
                  </span>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push('/client')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-coffee-900 hover:bg-gray-50 active:scale-95 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition"
              >
                <Save size={16} />
                {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
};

export default EditClient;
