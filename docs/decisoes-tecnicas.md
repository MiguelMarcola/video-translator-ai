# Decisões técnicas

Registro revisável. Onde o PRD tinha propostas antigas, valeu a stack confirmada em 28/10/2026 e os defaults pedidos para as escolhas ainda abertas.

## Adotadas

- TypeScript 5.9.3 em modo estrito. A linha 7 ainda não é a recomendada pelo Prisma 7.
- React 19 com Vite 8 e React Router 8. O pacote é `react-router`, não `react-router-dom`.
- Tailwind 4 e componentes no estilo shadcn, copiados para o repositório. O CLI interativo não foi executado.
- TanStack Query, React Hook Form e Zod 4.
- NestJS 12 para a API. O worker é um processo Node com BullMQ, não um segundo servidor HTTP.
- Prisma 7.10.1 com driver adapter PostgreSQL. A tag `latest` do Prisma apontava para um release candidate sem o fluxo de migration usado aqui.
- PostgreSQL 16 com pgvector, Redis 7.4 e fila BullMQ. A migration cria a extensão `vector` e um índice HNSW de cosseno em 1536 dimensões.
- Armazenamento privado compatível com S3. As imagens `minio/minio` e `minio/mc` não podem mais ser baixadas sem autenticação. O Compose usa `cgr.dev/chainguard/minio`. Essa imagem responde `NotImplemented` para CORS do bucket, então o player recebe URLs temporárias da própria API, que faz o streaming com `Range`.
- yt-dlp 2026.10.26 atrás de um adaptador. Só a URL canônica do vídeo entra no subprocesso.
- pnpm 10.18.2 com workspaces. `packages/database` e `packages/storage` existem porque Prisma e S3 são compartilhados pela API e pelo worker.
- Python com versões fixadas em `requirements.lock`. faster-whisper 1.2.1 ainda chama `metadata_errors`, removido no PyAV 19, então `av` fica em `>=11,<19` (`18.1.0` no lock).
- A transcrição lê o WAV PCM 16 kHz já preparado pelo FFmpeg, em vez de pedir ao PyAV para abrir o arquivo de novo.
- Argos Translate 1.11.0 só para o texto dos segmentos. O par habilitado é `en` para `pb`.
- Postgres local publicado em 5433 para não disputar a porta 5432.
- Sem ESLint nesta entrega. A checagem estática é o TypeScript estrito.
- Sem download de modelos no build. Cache em `.cache`.
- Identidade de desenvolvimento só com `NODE_ENV` diferente de `production`, `AUTH_MODE=development` e `ALLOW_DEV_IDENTITY=true`.

## Pendente de produto

- Provedor de autenticação de lançamento. A interface atual não substitui essa escolha.
- Modelos de chat e resumo da OpenAI. Ficam vazios até serem confirmados na conta usada.
- Outros pares de idioma. Só entram na interface depois de um pacote instalado e de uma execução real.
- Download real de um vídeo do YouTube. O adaptador está no código e ainda não foi exercitado com uma URL autorizada.
