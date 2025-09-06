import React from 'react';
import { useRouter } from 'next/router';
import axiosClient from '../../config/axios';
import Swal from 'sweetalert2';

const Client = ({ data, clients, setClients }) => {
  const router = useRouter();

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: '¿Eliminar cliente?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (confirm.isConfirmed) {
      try {
        await axiosClient.delete(`users/${id}`);
        setClients(clients.filter((c) => c.id !== id));
        Swal.fire('Eliminado', 'Cliente eliminado correctamente', 'success');
      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo eliminar el cliente', 'error');
      }
    }
  };

  return (
    <tr>
      <td className="border px-4 py-2">{data.name}</td>
      <td className="border px-4 py-2">{data.nombre_local}</td>
      <td className="border px-4 py-2">{data.dir1}</td>
      <td className="border px-4 py-2">{data.zona}</td>
      <td className="border px-4 py-2">{data.ciudad}</td>
      <td className="border px-4 py-2">{data.telefono}</td>
      <td className="border px-4 py-2">{data.email}</td>
      <td className="border px-2 py-2 text-center">
        <button
          onClick={() => handleDelete(data.id)}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Eliminar
        </button>
      </td>
      <td className="border px-2 py-2 text-center">
        <button
          onClick={() => router.push(`/client/${data.id}`)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Editar
        </button>
      </td>
    </tr>
  );
};

export default Client;
