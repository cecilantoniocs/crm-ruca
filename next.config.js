// next.config.js
/** @type {import('next').NextConfig} */
const path = require('path');

module.exports = {
  outputFileTracingRoot: path.join(__dirname),
  images: {
    unoptimized: true, // 🔧 Desactiva el optimizador: evita 400 en producción sin server de imágenes
  },
};
