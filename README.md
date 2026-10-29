# Voz em Cena

Aplicação local para transcrever a fala de um vídeo, traduzir as legendas para português do Brasil e assistir ao resultado com resumo e chat quando a OpenAI estiver configurada. O áudio original é preservado. Não há dublagem.

O único par anunciado na interface é inglês para português do Brasil. A tradução local usa o pacote Argos `translate-en_pb` 1.9. A duração máxima é 30 minutos. Os arquivos ficam disponíveis por 7 dias e podem ser excluídos antes. Resumo e chat usam a fala transcrita, não o texto que aparece só na imagem.

## Requisitos

- Node.js 24 e pnpm 10.18.2
- Python 3.12 ou 3.13
- FFmpeg e ffprobe com `libass`
- Docker, para PostgreSQL, Redis e armazenamento compatível com S3

## Instalação

Na raiz do repositório:

```sh
pnpm install
cp .env.example .env
python3 -m venv workers/media-python/.venv
workers/media-python/.venv/bin/pip install -r workers/media-python/requirements.lock
```

A infraestrutura local sobe com:

```sh
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @video-translate/database exec prisma migrate deploy
```

O Postgres do Compose usa a porta **5433** no computador, porque a 5432 costuma já estar ocupada. Redis fica em `6379`. O armazenamento fica em `http://localhost:9000`.

Se o IPv6 da rede não completar a conexão, defina `MEDIA_WORKER_FORCE_IPV4=1` no `.env`. Sem isso, o download dos modelos pode ficar parado.

## Modelos

Os modelos não são baixados durante o build da imagem. O cache fica em `.cache` e é reutilizado entre tarefas.

```sh
MEDIA_WORKER_FORCE_IPV4=1 PYTHONPATH=workers/media-python \
  workers/media-python/.venv/bin/python -m media_worker install-models \
  --cache "$(pwd)/.cache" --whisper-model base
```

Isso instala:

- faster-whisper `base`, em `.cache/whisper`
- Argos `en` para `pb` (português do Brasil), em `.cache/argos`

O modelo padrão é `base`, em CPU e `int8`. Não troque o tamanho sem medir memória e tempo neste computador.

## Execução

API, worker e interface rodam no computador. O Compose sobe apenas PostgreSQL, Redis e MinIO. Os Dockerfiles em `apps/` e `workers/media-python` não entram nesse fluxo. A imagem do worker, se for construída, instala `workers/media-python/requirements.txt`, não o `requirements.lock` do ambiente local.

Em três terminais, a partir da raiz:

```sh
pnpm --filter @video-translate/contracts build
pnpm --filter @video-translate/storage build
pnpm --filter @video-translate/database build
pnpm dev:api
```

```sh
pnpm dev:worker
```

```sh
pnpm dev:web
```

Abra `http://localhost:5173`. Em desenvolvimento, a identidade local usa o cabeçalho `X-Dev-User-Id`. A interface grava `local-dev` no navegador. Esse modo não é autenticação de lançamento e a API recusa subir se `NODE_ENV=production`.

### Primeira jornada com arquivo local

O arquivo precisa estar dentro de `var/local-media`. Este comando cria um MP4 curto em inglês, com voz do sistema:

```sh
sh scripts/create-sample-video.sh var/local-media/sample.mp4
```

Enfileire o arquivo autorizado:

```sh
pnpm --filter @video-translate/worker exec tsx src/local-file.ts \
  --file "$(pwd)/var/local-media/sample.mp4" \
  --user local-dev
```

O comando imprime o ID do projeto. Acompanhe em `http://localhost:5173/videos/<id>`.

A jornada pelo YouTube começa na tela inicial. A URL é normalizada para `https://www.youtube.com/watch?v=ID` antes de chegar ao yt-dlp. Um vídeo do YouTube já foi obtido e processado nesta máquina.

### Prova direta do pipeline

Sem banco nem fila:

```sh
MEDIA_WORKER_FORCE_IPV4=1 pnpm prove:media
```

O relatório fica em `var/prove/report.json`. Legendas e o MP4 gravado ficam no mesmo diretório.

## OpenAI

Resumo e chat usam o SDK oficial somente no servidor. Sem chave ou sem modelo, as duas funções aparecem como indisponíveis e o vídeo continua reproduzível.

Preencha no `.env`, com identificadores que a sua conta realmente aceite:

```sh
OPENAI_API_KEY=
OPENAI_SUMMARY_MODEL=
OPENAI_CHAT_MODEL=
OPENAI_EMBEDDING_MODEL=
OPENAI_EMBEDDING_DIMENSIONS=1536
```

A coluna vetorial está fixa em 1536 dimensões. `text-embedding-3-small` usa esse tamanho por padrão. `text-embedding-3-large` exige `OPENAI_EMBEDDING_DIMENSIONS=3072` e uma migration nova. Não invente o nome do modelo de chat: a página de modelos da OpenAI muda, e um identificador ausente deixa a etapa indisponível em vez de cair para outro serviço.

Resumo e chat leem a transcrição original. Se ela cabe no contexto, o chat a envia por completo. Em vídeos maiores, a busca usa embeddings. Uma pergunta em português sobre fala em inglês pode ficar abaixo de `CHAT_SIMILARITY_THRESHOLD` (0,2). Nesse caso a pergunta é traduzida para o idioma detectado e a busca se repete. A fala é o ponto focal do que o vídeo disse. Se a resposta usar conhecimento de fora da transcrição, isso entra na mesma prosa, sem markdown, lista ou aviso separado no final.

## Testes

```sh
pnpm test
```

Isso executa os testes de contrato em Vitest, os testes da interface e o pytest das legendas. Playwright não está instalado. O mesmo conjunto roda no GitHub pelo workflow `.github/workflows/ci.yml`. Lá o pytest instala só `pytest` e `yt-dlp`, sem o modelo do Whisper.

## Solução de problemas

- A API não sobe e cita `class-validator`: use o código atual. A validação é Zod e o `ValidationPipe` não é usado.
- Download de modelo parado: exporte `MEDIA_WORKER_FORCE_IPV4=1` e rode `install-models` de novo.
- `TypeError: metadata_errors` na transcrição: o ambiente precisa de `av>=11,<19`. O `requirements.lock` fixa `av==18.1.0`.
- Porta 5432 ocupada: o Compose já publica o Postgres em 5433. Mantenha o `DATABASE_URL` do `.env.example`.
- `pull access denied for minio/minio`: as imagens oficiais saíram dos registros públicos. O Compose usa `cgr.dev/chainguard/minio`.
- O player não carrega a partir de outra origem: a reprodução passa pela API em `/media/...`, com URL temporária assinada. A imagem atual do MinIO responde `NotImplemented` para CORS do bucket.
- Resumo ou chat indisponível: confira as quatro variáveis da OpenAI. A reprodução e o MP4 com legendas gravadas não dependem delas. SRT e VTT continuam na API, sem botão na tela.
- Identidade recusada: em local, `AUTH_MODE=development` e `ALLOW_DEV_IDENTITY=true`. Em produção a API não inicia.
