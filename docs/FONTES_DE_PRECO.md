# Fontes de preço — o que foi e o que NÃO foi verificado

**Nada foi coletado automaticamente.** Não presumi que existam APIs públicas nem acesso autorizado aos preços de Guanabara, Supermarket, Armazém Urbano, Assaí, Rede Economia, Mundial ou Prezunic. **Não verifiquei os termos de uso de nenhum desses sites** — essa checagem é pré-requisito para qualquer conector automático e fica a seu cargo/próxima etapa.

## Fontes que já funcionam (autorizadas por natureza: dado seu)
1. **Registro manual** (Preços → Registrar preço) — origem `manual` ou `confirmed`.
2. **Modo compra** — o preço que você digita na loja vira observação `confirmed` e alimenta o histórico.
3. **Importação CSV** (Preços → Importar) — origem `imported`, com conferência linha a linha antes de gravar.

## Fontes a estudar (por ordem de risco crescente)
| Fonte | O que checar antes | Observação |
|---|---|---|
| Encartes digitais (PDF/imagem) | Termos do site; extração é leitura de documento público, mas redistribuir pode ter restrição | Exigiria extração + conferência humana |
| APIs/parcerias oficiais | Contato comercial com a rede; chave de API | Único caminho robusto e autorizado |
| Notas fiscais (NFC-e) | Consulta por chave de acesso depende do portal da SEFAZ-RJ (captcha/limites); **não presumir** que o QR Code entrega os itens | Sempre com tela de conferência; LGPD |
| Sites de e-commerce das redes | robots.txt, termos, limites, preço online ≠ preço da loja física | Nunca assumir equivalência com a filial |

## Contrato para conectores futuros
`app/src/connectors/types.ts`: cada conector declara `authorization` (data e base da verificação). `assertActivatable` **impede ativar** conector automático sem essa verificação. Toda observação deve trazer filial específica, `observedAt`, `sourceRef` e validade quando houver.
