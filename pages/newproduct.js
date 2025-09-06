import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import axiosClient from '../config/axios';
import Swal from 'sweetalert2';
import { ArrowLeft, PackagePlus, Image as ImageIcon, Trash2 } from 'lucide-react';

/* ========= Input genérico estable ========= */
function InputField({ formik, id, label, type = 'text', ...rest }) {
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
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
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

const NewProduct = () => {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formik = useFormik({
    initialValues: {
      name: '',
      category: '',
      sku: '',
      cost: '',
      weight: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('El nombre es obligatorio'),
      category: Yup.string().required('La categoría es obligatoria'),
      sku: Yup.string().required('El SKU es obligatorio'),
      cost: Yup.number()
        .typeError('Ingresa un número válido')
        .required('El costo es obligatorio')
        .min(0, 'No puede ser negativo'),
      weight: Yup.string().required('El peso es obligatorio'),
    }),
    onSubmit: async (values) => {
      try {
        setIsSubmitting(true);
        const newProduct = {
          ...values,
          cost: Number(values.cost),
          imageUrl,
        };
        await axiosClient.post('products', newProduct);
        await Swal.fire('Éxito', 'Producto creado correctamente', 'success');
        router.push('/products');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Hubo un problema al crear el producto', 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data?.success) {
        setImageUrl(data.filePath);
        Swal.fire('Imagen subida', 'La imagen fue cargada correctamente', 'success');
      } else {
        throw new Error(data?.error || 'Error en la subida');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo subir la imagen', 'error');
    } finally {
      // limpia el valor del input para permitir volver a elegir el mismo archivo si se desea
      e.target.value = '';
    }
  };

  const handleRemoveImage = () => {
    setImageUrl('');
  };

  return (
    <Layout>
      {/* Header moderno con botón Atrás a la derecha */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight">
          Nuevo <span className="text-indigo-600">Producto</span>
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
        <form
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          onSubmit={formik.handleSubmit}
          autoComplete="off"
          noValidate
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField formik={formik} id="name" label="Nombre del producto" />
            <InputField formik={formik} id="category" label="Categoría" />
            <InputField formik={formik} id="sku" label="SKU" />
            <InputField
              formik={formik}
              id="cost"
              label="Costo"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
            />
            <div className="md:col-span-2">
              <InputField formik={formik} id="weight" label="Peso (ej: 2.5 kg)" />
            </div>

            {/* Fotografía con botones dinámicos */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Fotografía</label>

              <div className="flex items-center gap-3">
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 cursor-pointer active:scale-95 transition"
                >
                  <ImageIcon size={16} />
                  {imageUrl ? 'Cambiar imagen' : 'Seleccionar imagen'}
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />

                {imageUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 hover:bg-rose-100 active:scale-95 transition border border-rose-200"
                    title="Eliminar imagen"
                  >
                    <Trash2 size={16} />
                    Eliminar imagen
                  </button>
                )}
              </div>

              {imageUrl && (
                <div className="mt-3">
                  <img
                    src={imageUrl}
                    alt="preview"
                    className="w-32 h-32 object-cover rounded border border-gray-200"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/products')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition"
              title="Cancelar"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition"
              disabled={isSubmitting}
              title="Crear producto"
            >
              <PackagePlus size={16} />
              {isSubmitting ? 'Creando…' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default NewProduct;
