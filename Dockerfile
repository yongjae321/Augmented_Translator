FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY index.html app.js styles.css ./
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
