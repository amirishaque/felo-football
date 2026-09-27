FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
# data/ is a volume: day files and the budget ledger must survive a rebuild,
# or every deploy re-spends a day's worth of requests refilling the window.
RUN mkdir -p data && chown node:node data
VOLUME /app/data
EXPOSE 5100
USER node
CMD ["node", "src/server.js"]
