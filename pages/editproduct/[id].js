import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axiosClient from '../../config/axios';
import { ArrowLeft, Save, Image as ImageIcon, Upload, X } from 'lucide-react';

const EditProduct = () => {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // imagen local nueva (archivo) + preview
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  // datos actuales del producto
  const [current, setCurrent] = useState(null);

  // Cargar producto
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const res = await axiosClient.get(`products/${id}`);
        const p = res?.data ?? null;
        setCurrent(p);
        // si hay imagen, set preview inicial
        const existing = p?.image_url || p?.imageUrl || '';
        if (existing) setPreview(existing);
      } catch (e) {
        console.error(e);
        setLoadError('Error al cargar producto.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Formik
  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      name: current?.name || '',
      category: current?.category || '',
      sku: current?.sku || '',
      // costo opcional
      cost: current?.cost ?? '',
      // peso opcional (texto)
      weight: current?.weight || '',
      // solo para mantener una referencia si no cambian la imagen
      image_url: current?.image_url || current?.imageUrl || '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      category: Yup.string(),
      sku: Yup.string(),
      cost: Yup.mixed()
        .test('es-numero', 'Debe ser un número válido', (val) => {
          if (val === '' || val === null || val === undefined) return true; // opcional
          return !isNaN(Number(val));
        })
        .nullable(),
      weight: Yup.string().nullable(),
    }),
    onSubmit: async (val) => {
      try {
        setIsSubmitting(true);

        // 1) Subir imagen si seleccionaron un archivo nuevo
        let imageUrl = val.image_url || ''; // existente
        if (file) {
          const form = new FormData();
          form.append('file', file);
          // tu /api/upload ya debería existir (multer). Ajusta si el campo cambia.
          const up = await axiosClient.post('upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          imageUrl = up?.data?.url || up?.data?.path || up?.data?.location || '';
        }

        // 2) Normalizar costo opcional
        const cost =
          val.cost === '' || val.cost === null || val.cost === undefined
            ? null
            : Number(val.cost);

        // 3) Enviar PATCH
        const payload = {
          name: val.name,
          category: val.category || null,
          sku: val.sku || null,
          cost,                       // opcional -> null si vacío
          weight: val.weight || null, // opcional
          image_url: imageUrl || null,
        };

        await axiosClient.patch(`products/${id}`, payload);
        router.push('/products');
      } catch (e) {
        console.error(e);
        alert('No se pudo actualizar el producto.');
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Manejo archivo local
  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    formik.setFieldValue('image_url', '');
  };

  const renderError = (field) =>
    formik.touched[field] && formik.errors[field] ? (
      <p className="mt-1 text-rose-600 text-xs">{formik.errors[field]}</p>
    ) : null;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-coffee-900 tracking-tight">
          Editar <span className="text-brand-700">Producto</span>
        </h1>

        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-coffee-900 hover:bg-gray-50 active:scale-95 transition"
          title="Atrás"
          aria-label="Atrás"
        >
          <ArrowLeft size={16} />
          Atrás
        </button>
      </div>

      {loading && <p className="text-gray-600">Cargando producto…</p>}
      {!loading && loadError && <p className="text-danger-600">{loadError}</p>}

      {!loading && !loadError && current && (
        <div className="mx-auto w-full max-w-2xl">
          <form
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            onSubmit={formik.handleSubmit}
            noValidate
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">
                  Nombre del producto
                </label>
                <input
                  type="text"
                  placeholder="Nombre"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('name')}
                />
                {renderError('name')}
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">
                  Categoría
                </label>
                <input
                  type="text"
                  placeholder="Categoría"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('category')}
                />
                {renderError('category')}
              </div>

              {/* SKU */}
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">SKU</label>
                <input
                  type="text"
                  placeholder="SKU"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('sku')}
                />
                {renderError('sku')}
              </div>

              {/* Costo (opcional) */}
              <div>
                <label className="block text-sm font-medium text-coffee-900 mb-1">
                  Costo <span className="text-gray-500">(opcional)</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Costo"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('cost')}
                />
                {renderError('cost')}
              </div>

              {/* Peso (texto opcional) */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-coffee-900 mb-1">
                  Peso (ej: 2.5 kg)
                </label>
                <input
                  type="text"
                  placeholder="Peso"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  {...formik.getFieldProps('weight')}
                />
                {renderError('weight')}
              </div>

              {/* Imagen */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-coffee-900 mb-1">
                  Fotografía
                </label>

                <div className="flex items-center gap-3">
                  {preview ? (
                    <div className="relative h-16 w-16 rounded overflow-hidden border border-gray-200 bg-gray-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="preview" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow"
                        title="Quitar imagen"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded border border-dashed border-gray-300 flex items-center justify-center bg-gray-50 text-gray-400">
                      <ImageIcon size={18} />
                    </div>
                  )}

                  <div>
                    <label className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 cursor-pointer">
                      <Upload size={16} />
                      <span>Seleccionar imagen</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onPickFile}
                      />
                    </label>

                    {/* Si quieres permitir pegar una URL manual, descomenta esto:
                    <div className="mt-2">
                      <input
                        type="text"
                        placeholder="o pega una URL de imagen"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                        value={formik.values.image_url || ''}
                        onChange={(e) => {
                          setFile(null);
                          setPreview(e.target.value || null);
                          formik.setFieldValue('image_url', e.target.value);
                        }}
                      />
                    </div>
                    */}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push('/products')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-coffee-900 hover:bg-gray-50 active:scale-95 transition"
                title="Cancelar"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition"
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

export default EditProduct;
