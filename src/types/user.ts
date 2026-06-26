export type UserRole = 'coordenador' | 'consultor' | 'magistrado' | 'recuperanda' | 'gestor_ia' | 'admjudicial';

export interface User {
  email: string;
  role: UserRole | null;
  name: string;
}
