FROM node:22-alpine AS web-build
WORKDIR /src/web-vue
COPY web-vue/package*.json ./
RUN npm ci
COPY web-vue ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-17 AS server-build
WORKDIR /src/server-spring
COPY server-spring/pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline
COPY server-spring ./
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
ENV SERVER_PORT=8080
COPY --from=server-build /src/server-spring/target/activity-daily-server-*.jar /app/activity-daily-server.jar
COPY --from=web-build /src/web-vue/dist /app/static
EXPOSE 8080
CMD ["java", "-jar", "/app/activity-daily-server.jar"]