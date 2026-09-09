FROM node:22-alpine AS build

WORKDIR /app
COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci
COPY src/frontend/ ./
RUN npm run build && gzip -9 -k dist/compass-map.js

FROM nginx:alpine

COPY --from=build /app/dist/compass-map.js /app/dist/compass-map.js.gz /usr/share/nginx/html/
# The bundle's licences require their notice to accompany it.
COPY --from=build /app/THIRD-PARTY-NOTICES.md /usr/share/nginx/html/
COPY tools/docker/index.html /usr/share/nginx/html/index.html
COPY tools/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
