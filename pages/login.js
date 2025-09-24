// pages/login.js
import React, { useEffect, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import Image from 'next/image';
import axios from 'axios';

const logoUrl =
  process.env.NEXT_PUBLIC_BRAND_LOGO_URL || '/brand/rucapellan-logo.png';

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si ya hay sesión, redirige fuera del login
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isAuth = localStorage.getItem('isAuth') === 'true';
    const hasUser = !!localStorage.getItem('userData');
    if (isAuth && hasUser) {
      const next = router.query.next ? decodeURIComponent(router.query.next) : '/';
      router.replace(next);
    }
  }, [router, router.query.next]);

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: Yup.object({
      email: Yup.string().email('Email inválido').required('El email es obligatorio'),
      password: Yup.string().required('La contraseña es obligatoria'),
    }),
    onSubmit: async ({ email, password }) => {
      try {
        setIsSubmitting(true);
        const { data } = await axios.post('/api/auth/login', { email, password });
        const user = data?.user;
        if (!user) throw new Error('Respuesta de login inválida');

        localStorage.setItem('isAuth', 'true');
        localStorage.setItem('userData', JSON.stringify(user));

        const next = router.query.next ? decodeURIComponent(router.query.next) : '/';
        router.replace(next);
      } catch (err) {
        console.error(err);
        setMessage('Email o contraseña incorrectos');
        setTimeout(() => setMessage(''), 3000);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const renderError = (field) =>
    formik.touched[field] && formik.errors[field] ? (
      <p className="mt-1 text-rose-600 text-xs">{formik.errors[field]}</p>
    ) : null;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#F3D500]/15">
      {/* fondo sutil con patrón */}
      <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_50%_at_50%_0%,#000_0%,transparent_70%)]">
        <div className="h-full w-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]" />
      </div>

      {/* movemos la tarjeta un poco hacia arriba */}
      <div className="relative z-10 min-h-screen flex items-start justify-center px-4 pt-10 md:pt-16">
        <div className="w-full max-w-md">
          {/* Tarjeta */}
          <div className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm shadow-xl p-6 sm:p-8">
            {/* Marca */}
            <div className="flex flex-col items-center text-center">
              <div className="mb-4">
                <Image
                  src={logoUrl}
                  alt="Rucapellán"
                  width={160}
                  height={160}
                  className="h-40 w-40 object-contain"
                  priority
                />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-coffee">
                CRM <span className="text-coffee">Ruca</span>
              </h1>
            </div>

            {/* Mensaje */}
            {message && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {message}
              </div>
            )}

            {/* Formulario */}
            <form className="mt-6 space-y-4" onSubmit={formik.handleSubmit} noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-coffee mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="admin@admin.com"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  {...formik.getFieldProps('email')}
                />
                {renderError('email')}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-coffee mb-1">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  {...formik.getFieldProps('password')}
                />
                {renderError('password')}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-black transition disabled:opacity-60"
              >
                {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
            </form>

            {/* Pie de tarjeta */}
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-lg bg-[rgb(39,39,38)] px-3 py-1.5 text-xs font-medium text-white shadow-sm">
                <span>CRM-Ruca v1.0</span>
                <span className="opacity-70">•</span>
                <span>Developed by Cecil ⚡</span>
              </div>
            </div>
          </div>

          {/* Nota/legal mínima */}
          <p className="mt-4 text-center text-xs text-gray-500">
            Acceso restringido. Si necesitas ayuda, contacta al administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
