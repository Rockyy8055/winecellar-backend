# Stage 1: Build stage
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

# Stage 2: Production stage
FROM node:20
WORKDIR /app
COPY --from=builder /app ./
COPY . .
CMD ["npm", "start"]
