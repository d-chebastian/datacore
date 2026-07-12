FROM node:20-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
