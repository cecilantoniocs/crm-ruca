import React from 'react';
import Layout from '../components/Layout';

const Dashboard = () => {
  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-2xl font-light text-coffee">
          Bienvenido al CRM
        </h1>
        <p className="text-gray-600 mt-2">
          Próximamente: panel con métricas y accesos rápidos.
        </p>
      </div>
    </Layout>
  );
};

export default Dashboard;
