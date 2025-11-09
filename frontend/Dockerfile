# Build stage
FROM node:20-alpine AS build
WORKDIR /workspace
COPY clients/angular-auth ./clients/angular-auth
WORKDIR /workspace/cribs/frontend
COPY cribs/frontend/package.json ./package.json
COPY cribs/frontend/yarn.lock ./yarn.lock
RUN corepack enable \
 && if [ -f yarn.lock ]; then yarn install --immutable; else yarn install; fi \
 && ln -s /workspace/cribs/frontend/node_modules /workspace/node_modules
COPY cribs/frontend/ .
RUN yarn build

# Runtime stage
FROM nginx:1.27-alpine
# Angular 17+ application builder outputs browser assets under dist/cribs/browser
COPY --from=build /workspace/cribs/frontend/dist/cribs/browser /usr/share/nginx/html
COPY cribs/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
