pipeline {
  agent {
    kubernetes {
      defaultContainer 'node'
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
    command: ['cat']
    tty: true
  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    command: ['cat']
    tty: true
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ['/busybox/sh']
    args: ['-c', 'sleep 9999999']
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
  - name: kubectl
    image: bitnami/kubectl:1.29
    command: ['sh','-c','sleep 36000']
    tty: true
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

  // pas de triggers {} en Multibranch
  options { timestamps(); ansiColor('xterm') }

  environment {
    IMAGE = "adelbettaieb/gestionentreprise"
    TAG   = "${env.BRANCH_NAME == 'main' ? 'latest' : env.BRANCH_NAME}-${env.BUILD_NUMBER}"
    K8S_NS = "jenkins" // simple: on déploie dans le même namespace
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
            test -f "$WORKSPACE/emp_backend/Dockerfile" || {
              echo "Dockerfile introuvable: $WORKSPACE/emp_backend/Dockerfile"; exit 1;
            }

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

    stage('Deploy to Minikube') {
      when { branch 'main' }
      steps {
        container('kubectl') {
          sh '''
            # Manifests "k8s/" dans le repo (exemples ci-dessous)
            # Remplacement de l'image par la nouvelle taguée
            sed "s|IMAGE_PLACEHOLDER|docker.io/$IMAGE:$TAG|g" k8s/deployment.yaml | kubectl -n $K8S_NS apply -f -
            kubectl -n $K8S_NS apply -f k8s/service.yaml
            kubectl -n $K8S_NS rollout status deploy/gestionentreprise
          '''
        }
      }
    }
  }

  post {
    success { echo '✅ Build & Deploy OK' }
    failure { echo '❌ Echec — voir Console Output' }
  }
}
