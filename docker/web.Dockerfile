FROM node:22-alpine AS build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build && gzip -9 -k dist/compass-map.js

FROM nginx:alpine

COPY --from=build /app/dist/compass-map.js /app/dist/compass-map.js.gz /usr/share/nginx/html/
COPY docker/index.html /usr/share/nginx/html/index.html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
