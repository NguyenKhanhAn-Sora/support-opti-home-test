FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN chown -R node:node /app
USER node

CMD ["node", "main.js"]
