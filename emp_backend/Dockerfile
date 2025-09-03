# emp_backend/Dockerfile
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Nom du JAR produit par Maven (vu dans tes logs)
ARG JAR=emp_backend-0.0.1-SNAPSHOT.jar
COPY target/${JAR} /app/app.jar

EXPOSE 8080
# Optionnel: passe des flags JVM via JAVA_OPTS
ENV JAVA_OPTS=""
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar /app/app.jar"]
