FROM node:22

COPY package.json ./

RUN npm install

COPY . ./

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:80 || exit 1

CMD ["npm", "run", "start"]
