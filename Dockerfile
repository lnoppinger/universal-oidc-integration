FROM node:22

COPY package.json ./

RUN npm install

COPY . ./

EXPOSE 80

CMD ["npm", "run", "start"]