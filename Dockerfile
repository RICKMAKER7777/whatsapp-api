
# Use node official image
FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies, sqlite3 needs build-base
RUN apk add --no-cache python3 make g++ && rm -rf /var/cache/apk/*

COPY package.json package.json
RUN npm install --production

COPY . .

EXPOSE 10000
CMD [ "node", "index.js" ]
