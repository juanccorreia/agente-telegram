import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Slots() {
  const qc = useQueryClient();
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['slots'],
    queryFn: () => api.get('/slots'),
  });

  const [datetime, setDatetime] = useState('');
  const [recurrence, setRecurrence] = useState('');

  const createMutation = useMutation({
    mutationFn: () => api.post('/slots', { datetime, recurrence: recurrence || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['slots'] }); setDatetime(''); setRecurrence(''); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/slots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });

  if (isLoading) return <Layout><p>Carregando...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Horários Disponíveis</h1>
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader><CardTitle className="text-base">Novo Horário</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Data e Hora</Label>
              <Input
                type="datetime-local"
                value={datetime}
                onChange={e => setDatetime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Recorrência (opcional)</Label>
              <select
                className="border rounded px-3 py-2 text-sm w-full"
                value={recurrence}
                onChange={e => setRecurrence(e.target.value)}
              >
                <option value="">Sem recorrência</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={!datetime || createMutation.isPending}>
              {createMutation.isPending ? 'Criando...' : 'Criar Horário'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {slots.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum horário cadastrado.</p>
          )}
          {slots.map(slot => {
            const d = new Date(slot.datetime);
            return (
              <div key={slot.id} className="flex items-center justify-between bg-white border rounded px-4 py-3">
                <div>
                  <p className="font-medium text-sm">
                    {d.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}
                  </p>
                  {slot.recurrence && (
                    <p className="text-xs text-slate-500">Recorrência: {slot.recurrence}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={slot.occupied ? 'destructive' : 'default'}>
                    {slot.occupied ? 'Ocupado' : 'Livre'}
                  </Badge>
                  {!slot.occupied && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(slot.id)}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
