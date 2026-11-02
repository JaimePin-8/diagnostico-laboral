-- Respuestas anónimas de la encuesta. Sin nombre, correo, empresa ni puesto.
-- ip_hash es un SHA-256 con sal secreta; solo sirve para limitar abuso.
create table public.respuestas (
  id                 uuid primary key default gen_random_uuid(),
  creado             timestamptz not null default now(),
  ip_hash            text not null,
  horas_dia          numeric(4,1) not null check (horas_dia >= 0.5 and horas_dia <= 24),
  fin_semana         text not null check (fin_semana in ('no', 'sab', 'dom', 'ambos')),
  salario_diario     numeric(12,2) not null check (salario_diario > 0 and salario_diario <= 10000000),
  zona               text not null check (zona in ('g', 'f')),
  horas_extra        text not null check (horas_extra in ('si', 'no', 'nh')),
  horas_extra_semana numeric(4,1) check (horas_extra_semana >= 0 and horas_extra_semana <= 100),
  descanso_min       integer not null check (descanso_min in (0, 15, 30, 45, 60, 90, 120)),
  trato              text not null check (trato in ('si', 'av', 'no')),
  puntaje            integer not null check (puntaje between 0 and 100),
  estado             text not null
);

create index respuestas_ip_creado_idx on public.respuestas (ip_hash, creado desc);

-- RLS activo y sin políticas: la API pública (anon/authenticated) no puede leer ni escribir.
-- Solo la función, con la llave de servicio, accede a la tabla.
alter table public.respuestas enable row level security;
revoke all on public.respuestas from anon, authenticated;
