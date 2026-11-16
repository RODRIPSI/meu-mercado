-- Dados de referência (NÃO são preços). Redes iniciais e categorias.
insert into public.chains (name) values
  ('Guanabara'), ('Supermarket'), ('Armazém Urbano'), ('Assaí'),
  ('Rede Economia'), ('Mundial'), ('Prezunic')
on conflict do nothing;

insert into public.categories (name, sort) values
  ('Hortifruti',10), ('Açougue e peixes',20), ('Laticínios e frios',30), ('Padaria',40),
  ('Mercearia',50), ('Grãos e cereais',60), ('Bebidas',70), ('Congelados',80),
  ('Limpeza',90), ('Higiene e beleza',100), ('Pet',110), ('Outros',999)
on conflict do nothing;
