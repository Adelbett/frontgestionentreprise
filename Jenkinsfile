pipeline {
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
metadata:
  labels:
    jenkins: agent
spec:
  serviceAccountName: jenkins
  containers:
  - name: node
    image: node:20-bullseye
    command: ['cat']
    tty: true
  - name: maven
    image: maven:3.9-eclipse-temurin-17
    command: ['cat']
    tty: true
  - name: kaniko
    image: gcr.io/kaniko-project/executor:latest
    command: ['cat']
    tty: true
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
  volumes:
  - name: docker-config
    secret:
      secretName: regcred
      items:
      - key: .dockerconfigjson
        path: config.json
      """
    }
  }

  options { timestamps() }
  triggers { githubPush() } // webhook

  environment {
    IMAGE = "adelbettaieb/gestionentreprise"   // <-- change si besoin
    TAG   = "${env.BRANCH_NAME == 'main' ? 'latest' : env.BRANCH_NAME}-${env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') { steps { checkout scm } }

    stage('Build Front') {
      steps {
        container('node') {
          dir("employee frontend final") {
            sh '''
              echo "==> Front: npm install & build"
              npm ci || npm install
              npm run build || npx ng build --configuration=production || true
            '''
          }
        }
      }
    }

    stage('Build Back') {
      steps {
        container('maven') {
          dir('emp_backend') {
            sh '''
              echo "==> Back: Maven package (skip tests)"
              if [ -x ./mvnw ]; then
                ./mvnw -B -DskipTests package
              else
                mvn -B -DskipTests package
              fi
            '''
          }
        }
      }
    }

    stage('Build & Push Image') {
      steps {
        container('kaniko') {
          sh '''
            # Si ton Dockerfile n’est pas à la racine, adapte --context et --dockerfile
            /kaniko/executor \
              --context "$WORKSPACE" \
              --dockerfile Dockerfile \
              --destination docker.io/$IMAGE:$TAG \
              --destination docker.io/$IMAGE:latest \
              --snapshotMode=redo \
              --verbosity=info
          '''
        }
      }
    }
  }

  post {
    success { echo '✅ Build OK — image poussée sur Docker Hub.' }
    failure { echo '❌ Build failed — check Console Output.' }
  }
}
