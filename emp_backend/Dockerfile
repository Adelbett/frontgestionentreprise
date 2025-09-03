# emp_backend/Dockerfile
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Nom du JAR produit par Maven (vu dans tes logs)
ARG JAR=emp_backend-0.0.1-SNAPSHOT.jar
COPY target/${JAR} /app/app.jar

EXPOSE 8080
# Options JVM éventuelles
ENV JAVA_OPTS=""

# IMPORTANT: 'exec' pour que Java soit PID 1 (signaux/probes OK)
ENTRYPOINT ["sh","-c","exec java $JAVA_OPTS -jar /app/app.jar"]
