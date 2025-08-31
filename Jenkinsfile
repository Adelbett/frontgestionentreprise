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
  imagePullSecrets:
  - name: regcred

  containers:
  - name: node
    image: docker.io/library/node:20-bullseye
    command: ['cat']; tty: true

  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    command: ['cat']; tty: true

  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ['/busybox/sh']; args: ['-c', 'sleep 99d']
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker

  - name: kubectl
    image: bitnami/kubectl:1.29
    command: ['sleep']; args: ['99d']

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
  triggers { githubPush() }   // déclenché par webhook GitHub

  environment {
    IMAGE = "adelbettaieb/gestionentreprise"
    TAG   = "${env.BRANCH_NAME == 'main' ? 'latest' : env.BRANCH_NAME}-${env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') { steps { checkout scm } }

    stage('Build Front') {
      steps {
        container('node') {
          dir('employee frontend final') {
            sh '''
              echo "==> Front: npm install & build"
              npm ci || npm install
              npm run build || npx ng build --configuration=production || true
            '''
          }
        }
      }
    }

    stage('Build Back (Maven)') {
      steps {
        container('maven') {
          dir('emp_backend') {
            sh '''
              echo "==> Back: Maven package (skip tests)"
              if [ -x ./mvnw ]; then ./mvnw -B -DskipTests package
              else mvn -B -DskipTests package; fi
            '''
          }
        }
      }
    }

    stage('Build & Push Image (Kaniko)') {
      steps {
        container('kaniko') {
          sh '''
            test -f "$WORKSPACE/emp_backend/Dockerfile" || { echo "Dockerfile manquant"; exit 1; }
            /kaniko/executor \
              --context "$WORKSPACE/emp_backend" \
              --dockerfile Dockerfile \
              --destination docker.io/$IMAGE:$TAG \
              --destination docker.io/$IMAGE:latest \
              --snapshot-mode=redo --verbosity=info
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          sh '''
            kubectl -n jenkins apply -f k8s/
            kubectl -n jenkins rollout status deploy/gestionentreprise --timeout=120s
            kubectl -n jenkins get svc gestionentreprise -o wide
          '''
        }
      }
    }
  }

  post {
    success { echo '✅ Build & déploiement OK' }
    failure { echo '❌ Echec — voir Console Output' }
  }
}
