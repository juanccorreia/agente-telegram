import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';

export default function Appointments() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState({});

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', filter],
    queryFn: () => {
      const params = filter.from && filter.to
        ? `?from=${filter.from}&to=${filter.to}`
        : '';
      return api.get(`/appointments${params}`);
    },
  });

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Agendamentos</h1>
      <div className="max-w-4xl space-y-4">
        <div className="flex gap-4 items-end">
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Button onClick={() => setFilter({ from, to })} disabled={!from || !to}>
            Filtrar
          </Button>
          <Button variant="outline" onClick={() => { setFilter({}); setFrom(''); setTo(''); }}>
            Limpar
          </Button>
        </div>

        {isLoading ? (
          <p>Carregando...</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum agendamento encontrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Data/Hora (Slot ID)</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.slot_id}</TableCell>
                  <TableCell className="font-mono text-sm">{a.telegram_id}</TableCell>
                  <TableCell>{new Date(a.created_at).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Layout>
  );
}
