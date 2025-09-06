// pages/editclient/[id].js
import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axiosClient from '../../config/axios';
import Swal from 'sweetalert2';
import { ArrowLeft, Save } from 'lucide-react';

/* ================= Helpers (módulo) ================= */

// Normaliza teléfono a formato +56 + dígitos
const normalizePhoneCL = (val) => {
  if (!val) return '';
  const digits = val.replace(/[^\d]/g, '');
  if (val.startsWith('+56')) return `+56${digits.replace(/^56/, '').replace(/^0+/, '')}`;
  if (val.startsWith('56'))  return `+56${digits.replace(/^56/, '').replace(/^0+/, '')}`;
  return `+56${digits.replace(/^0+/, '')}`;
};

// Convierte un teléfono almacenado (+56XXXXXXXXX o 56XXXXXXXXX) a solo dígitos para el input (sin prefijo)
const phoneToDigitsCL = (val) => {
  if (!val) return '';
  const digits = val.replace(/[^\d]/g, '');
  return digits.replace(/^56/, '');
};

// Normaliza RUT (sin puntos; si no trae guion y tiene al menos 2 chars, lo agrega)
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

// Validación simple de RUT (7–8 dígitos + guion + dígito/K)
const validateRutBasic = (rut) => {
  if (!rut) return true; // opcional
  return /^\d{7,8}-[\dK]$/.test(rut);
};

/* ============ Componentes de input (estables) ============ */

function InputField({ formik, id, label, type = 'text', onChange, onBlur, ...rest }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={label}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
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
          className="w-full rounded-r-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
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

/* ===================== Página ===================== */

const EditClient = () => {
  const router = useRouter();
  const { id } = router.query;

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carga del cliente
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const res = await axiosClient.get(`clients/${id}`);
        const c = res.data || {};

        // 🔁 Normalizamos la forma para el formulario (usa nombre_local)
        const formShape = {
          id: c.id,
          name: c.name || '',
          nombre_local: c.nombre_local ?? c.local_name ?? '',
          dir1: c.dir1 || '',
          zona: c.zona || '',
          ciudad: c.ciudad || '',
          telefono: phoneToDigitsCL(c.telefono || ''),
          email: c.email || '',
          rut: c.rut || '',
          razon_social: c.razon_social || '',
          sellerId: c.sellerId ?? c.owner_id ?? null,
        };

        setClient(formShape);
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
      telefono: client?.telefono || '',
      email: client?.email || '',
      rut: client?.rut || '',
      razon_social: client?.razon_social || '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      nombre_local: Yup.string().required('El nombre del local es obligatorio'),
      dir1: Yup.string().required('La dirección es obligatoria'),
      zona: Yup.string().required('La zona es obligatoria'),
      ciudad: Yup.string().required('La ciudad es obligatoria'),
      telefono: Yup.string()
        .matches(/^\d+$/, 'Solo números')
        .min(8, 'Muy corto')
        .max(9, 'Muy largo')
        .required('El teléfono es obligatorio'),
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      rut: Yup.string().test('rut-basic', 'RUT inválido (ej: 12345678-9)', validateRutBasic),
      razon_social: Yup.string(),
    }),
    onSubmit: async (val) => {
      try {
        setIsSubmitting(true);

        // reconstruye el teléfono con +56
        const telefonoFull = normalizePhoneCL(`+56${val.telefono}`);

        // 🔁 Mapea a nombres de columna de la BD (snake_case)
        const patch = {
          name: val.name,
          local_name: val.nombre_local,
          dir1: val.dir1,
          zona: val.zona,
          ciudad: val.ciudad,
          telefono: telefonoFull,
          email: val.email,
          rut: normalizeRut(val.rut),
          razon_social: val.razon_social,
          owner_id: client?.sellerId ?? null,
        };

        await axiosClient.patch(`clients/${id}`, patch);

        await Swal.fire('Editado', 'Cliente actualizado correctamente.', 'success');
        router.push('/client');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo actualizar el cliente.', 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <Layout>
      {/* Header con botón Atrás a la derecha */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
          Editar <span className="text-indigo-600">Cliente</span>
        </h1>

        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition"
          title="Volver"
          aria-label="Volver"
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
              {/* opcionales al final */}
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
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition"
                title="Guardar cambios"
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
