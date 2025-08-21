# syntax=docker/dockerfile:1

# --- 1) Build (Maven + JDK 17)
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Mettre le cache Maven en place
COPY pom.xml .
RUN mvn -B -q -DskipTests dependency:go-offline

# Copier le code et packager
COPY src ./src
RUN mvn -B -DskipTests package

# --- 2) Runtime (JRE 17 seulement)
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Copier le JAR construit
COPY --from=build /app/target/*.jar /app/app.jar

EXPOSE 8080
# (optionnel) tu peux passer des options JVM via JAVA_OPTS
ENV JAVA_OPTS=""
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar /app/app.jar"]
