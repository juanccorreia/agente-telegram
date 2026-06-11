import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';

export default function Contacts() {
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts'),
  });

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Contatos Atendidos</h1>
      <div className="max-w-3xl">
        {isLoading ? (
          <p>Carregando...</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum contato ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Primeiro Contato</TableHead>
                <TableHead>Último Contato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map(c => (
                <TableRow key={c.telegram_id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.telegram_id}</TableCell>
                  <TableCell>{new Date(c.first_seen).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{new Date(c.last_seen).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Layout>
  );
}
