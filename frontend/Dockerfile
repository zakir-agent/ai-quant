FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NEXT_PUBLIC_API_URL=http://localhost:8000

CMD ["npm", "run", "dev"]
