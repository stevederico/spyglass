FROM node:24-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm install && cd backend && npm install

COPY . .

RUN npm run build

FROM node:24-alpine

RUN apk add --no-cache libstdc++

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/backend ./backend
<<<<<<< /var/folders/c7/8_zkmby94mg9cmkd3knh6w940000gn/T/sk-mf-cur.tmp

# Copy root node_modules (npm workspaces hoists backend deps here)
COPY --from=builder /app/node_modules ./node_modules
=======
>>>>>>> /var/folders/c7/8_zkmby94mg9cmkd3knh6w940000gn/T/sk-mf-new.tmp

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && cd backend && npm install --omit=dev \
    && apk del .build-deps

RUN chown -R node:node /app/backend

USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8000/api/health', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

<<<<<<< /var/folders/c7/8_zkmby94mg9cmkd3knh6w940000gn/T/sk-mf-cur.tmp
# Run server
WORKDIR /app/backend
CMD ["node", "--experimental-sqlite", "server.js"]
=======
WORKDIR /app/backend
CMD ["node", "server.js"]
>>>>>>> /var/folders/c7/8_zkmby94mg9cmkd3knh6w940000gn/T/sk-mf-new.tmp
