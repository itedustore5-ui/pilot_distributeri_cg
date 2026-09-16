FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server ./server
COPY public ./public

# SQL fajlovi idu — potrebni su za kreiranje šeme.
COPY db/*.sql ./db/

# BANKA PITANJA NAMERNO NE ULAZI U SLIKU.
# Ona je najvredniji deo proizvoda i nema razloga da leži na tuđem disku.
# Baza se puni sa računara izvođača, jednom, pri instalaciji:
#   DATABASE_URL=<baza klijenta> node db/seed.js --svez
# Posle toga pitanja postoje samo u bazi, a ne kao fajl.

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "server/index.js"]
