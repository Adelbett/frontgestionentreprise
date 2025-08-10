# Phase de build
FROM maven:3.8.7-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn clean package -DskipTests

# Phase d'exécution
FROM openjdk:17-jdk-slim
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080

# Ajout d'un utilisateur non-root (optionnel mais recommandé)
RUN useradd -m springuser
USER springuser

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
