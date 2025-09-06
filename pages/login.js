import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import axiosClient from '../config/axios';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema: Yup.object({
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      password: Yup.string().required('La contraseña es obligatoria'),
    }),
    onSubmit: async (data) => {
      try {
        setIsSubmitting(true);

        // Llamamos a nuestro API Route que valida contra Supabase
        const resp = await axiosClient.post('auth/login', {
          email: data.email,
          password: data.password,
        });

        if (!resp?.data?.ok) {
          localStorage.removeItem('userData');
          localStorage.setItem('isAuth', 'false');
          setMessage(resp?.data?.message || 'Email o contraseña incorrectos');
          setTimeout(() => setMessage(''), 3000);
          return;
        }

        // Usuario devuelto por el API
        const u = resp.data.user || {};

        // Normalizaciones de compatibilidad con el resto de la app
        const role = String(u.role || '').trim().toLowerCase() || 'vendedor';
        const isAdmin = Boolean(u.is_admin) || Boolean(u.isAdmin) || role === 'admin';

        // Permisos por defecto si no vienen desde la BD
        let permissions = Array.isArray(u.permissions) ? u.permissions : null;
        if (!permissions) {
          permissions = isAdmin
            ? ['*']
            : [
                'orders:read',
                'orders:create',
                'orders:update',
                'clients:read',
                'clients:create',
                'clients:update',
                'products:read',
              ];
        }

        const userPayload = {
          id: u.id,
          name: u.name,
          email: u.email,
          role,
          isAdmin,          // camelCase (lo usa tu Sidebar)
          is_admin: isAdmin, // snake_case (compat extra)
          permissions,
          profileName: u.profile_name || u.profileName || role,
          partnerTag: u.partner_tag || u.partnerTag || '',
          sellerId: u.seller_id || u.sellerId || u.id, // compat con helpers que usan sellerId
        };

        localStorage.setItem('isAuth', 'true');
        localStorage.setItem('userData', JSON.stringify(userPayload));

        router.push('/');
      } catch (err) {
        console.error(err);
        localStorage.removeItem('userData');
        localStorage.setItem('isAuth', 'false');
        setMessage('Error al conectar con el servidor');
        setTimeout(() => setMessage(''), 3000);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const renderError = (field) =>
    formik.touched[field] && formik.errors[field] ? (
      <p className="my-2 text-red-600 text-sm">{formik.errors[field]}</p>
    ) : null;

  return (
    <Layout>
      <h1 className="text-center text-2xl text-white font-light">Login</h1>

      {message && (
        <div className="bg-white py-2 px-3 w-full my-3 max-w-sm text-center mx-auto">
          <p>{message}</p>
        </div>
      )}

      <div className="flex justify-center mt-5">
        <div className="w-full max-w-sm">
          <form
            className="bg-white rounded shadow-md px-8 pt-6 pb-8 mb-4"
            onSubmit={formik.handleSubmit}
          >
            {/* Email */}
            <div className="mb-4">
              <label
                className="block text-gray-700 text-sm font-bold mb-2"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="Email Usuario"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                {...formik.getFieldProps('email')}
              />
              {renderError('email')}
            </div>

            {/* Password */}
            <div className="mb-4">
              <label
                className="block text-gray-700 text-sm font-bold mb-2"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Password Usuario"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                {...formik.getFieldProps('password')}
              />
              {renderError('password')}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-gray-800 w-full mt-5 p-2 text-white uppercase font-bold hover:cursor-pointer hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
