// pages/editproduct/[id].js
import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axiosClient from '../../config/axios';
import Swal from 'sweetalert2';
import { ArrowLeft, Save, Image as ImageIcon, Upload, X } from 'lucide-react';

const EditProduct = () => {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Imagen actual (URL pública) y preview
  const [imageUrl, setImageUrl] = useState('');
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
        const existing = p?.imageUrl || p?.image_url || '';
        setImageUrl(existing || '');
        setPreview(existing || null);
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
      // costo opcional (dejar como string para que el backend acepte number|string)
      cost: current?.cost ?? '',
      // peso opcional (texto)
      weight: current?.weight || '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      category: Yup.string(),
      sku: Yup.string(),
      // Permitimos string vacío; si viene, debe ser número válido
      cost: Yup.string()
        .test('es-numero', 'Debe ser un número válido', (val) => {
          if (val === '' || val == null) return true;
          return !isNaN(Number(val));
        }),
      weight: Yup.string().nullable(),
    }),
    onSubmit: async (val) => {
      try {
        setIsSubmitting(true);

        // Construir payload SOLO con campos presentes
        const payload = { name: val.name };

        if (val.category?.trim()) payload.category = val.category.trim();
        if (val.sku?.trim()) payload.sku = val.sku.trim();

        // cost: si viene string no vacío => número; si viene vacío => no enviar
        if (val.cost !== '' && val.cost != null) {
          payload.cost = Number(val.cost);
        }

        if (val.weight?.trim()) payload.weight = val.weight.trim();

        // imageUrl: si hay string no vacío, mandarlo; si está vacío, NO lo mandamos
        const img = imageUrl && String(imageUrl).trim();
        if (img) payload.imageUrl = String(img);

        await axiosClient.patch(`products/${id}`, payload);
        await Swal.fire('¡Guardado!', 'Producto actualizado correctamente', 'success');
        router.push('/products');
      } catch (e) {
        console.error(e);
        const msg =
          e?.response?.data?.detail ||
          e?.response?.data?.error ||
          'No se pudo actualizar el producto.';
        Swal.fire('Error', String(msg), 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Subida de imagen (misma forma que en newproduct)
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await axiosClient.post('upload?folder=products', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data?.success && data?.publicUrl) {
        setImageUrl(data.publicUrl);
        setPreview(data.publicUrl);
        await Swal.fire('Imagen subida', 'La imagen fue cargada correctamente', 'success');
      } else {
        throw new Error(data?.error || 'Error en la subida');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo subir la imagen', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const clearImage = () => {
    setImageUrl('');
    setPreview(null);
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

              {/* Imagen (misma forma que newproduct) */}
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
                        onChange={handleImageUpload}
                      />
                    </label>
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
