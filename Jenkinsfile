// =======================
// Jenkinsfile (Declarative)
// =======================
pipeline {

  // Build inside a Kubernetes agent pod
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

  # Workspace partagé accessible en écriture
  securityContext:
    fsGroup: 1000

  initContainers:
  - name: init-perms
    image: busybox:1.36
    command: ["sh","-c"]
    args: ["mkdir -p /home/jenkins/agent && chmod 0777 /home/jenkins/agent"]
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  containers:
  - name: node
    image: docker.io/library/node:20-bullseye
    imagePullPolicy: IfNotPresent
    command: ["cat"]                  # conteneur vivant
    tty: true
    workingDir: /home/jenkins/agent
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2-debug
    imagePullPolicy: IfNotPresent
    command: ["/busybox/sh","-c"]     # GARANTI: shell présent
    args: ["sleep 99d"]
    tty: true
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker
    workingDir: /home/jenkins/agent
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  - name: kubectl
    image: bitnami/kubectl:1.29-debian-12
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh","-c"]         # GARANTI: shell présent
    args: ["sleep 99d"]
    tty: true
    securityContext:
      runAsUser: 0                    # évite soucis d’exec/permissions
    workingDir: /home/jenkins/agent
    volumeMounts:
    - name: workspace-volume
      mountPath: /home/jenkins/agent

  volumes:
  - name: docker-config
    secret:
      secretName: regcred
      items:
      - key: .dockerconfigjson
        path: config.json

  - name: workspace-volume
    emptyDir: {}
"""
      defaultContainer 'kubectl'
      // cloud 'kubernetes'  // décommente seulement si ton Cloud a un autre nom
    }
  }

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    skipDefaultCheckout(true)   // évite le double "Declarative: Checkout SCM"
  }

  triggers { githubPush() }

  environment {
    DOCKER_IMAGE = 'adelbettaieb/gestionentreprise'
    K8S_NS       = 'jenkins'
    APP_NAME     = 'gestionentreprise'
    INGRESS_HOST = 'app.local'
  }

  stages {

    stage('Init vars') {
      steps {
        script {
          env.TAG = (env.BRANCH_NAME == 'main') ? 'latest' : "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
          echo "Using image tag: ${env.TAG} (branch=${env.BRANCH_NAME})"
        }
      }
    }

    stage('Checkout') {
      steps { checkout scm }
    }

    // Petit test pour valider que 'sh' démarre bien
    stage('Sanity sh') {
      steps {
        container('kubectl') {
          sh 'set -x; whoami || true; pwd; ls -ld .'
        }
      }
    }

    stage('Pre-flight: versions') {
      steps {
        container('kubectl') { sh 'kubectl version --client=true' }
        container('node')    { sh 'node --version && npm --version' }
        container('maven')   { sh 'mvn -v' }
      }
    }

    stage('Build Frontend') {
      steps {
        container('node') {
          dir('employee frontend final') {  // <-- renomme si ton dossier diffère
            sh '''
              set -eux
              npm ci || npm install
              npm run build || true
            '''
          }
        }
      }
    }

    stage('Build Backend (Maven)') {
      steps {
        container('maven') {
          dir('emp_backend') {
            sh '''
              set -eux
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

    stage('Build & Push Image (Kaniko)') {
      steps {
        container('kaniko') {
          sh '''
            set -eux
            test -f "$WORKSPACE/emp_backend/Dockerfile"
            /kaniko/executor \
              --context "$WORKSPACE/emp_backend" \
              --dockerfile Dockerfile \
              --destination "docker.io/$DOCKER_IMAGE:$TAG" \
              --snapshot-mode=redo --verbosity=info

            if [ "$BRANCH_NAME" = "main" ]; then
              /kaniko/executor \
                --context "$WORKSPACE/emp_backend" \
                --dockerfile Dockerfile \
                --destination "docker.io/$DOCKER_IMAGE:latest" \
                --snapshot-mode=redo --verbosity=info
            fi
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          sh '''
            set -eux
            test -d "$WORKSPACE/k8s"
            kubectl -n "$K8S_NS" apply -f "$WORKSPACE/k8s"
            kubectl -n "$K8S_NS" set image deploy/$APP_NAME app="docker.io/$DOCKER_IMAGE:$TAG" --record
            kubectl -n "$K8S_NS" rollout status deploy/$APP_NAME --timeout=180s
          '''
        }
      }
    }

    stage('Smoke Test (Ingress)') {
      steps {
        container('kubectl') {
          sh '''
            set -eux
            kubectl -n "$K8S_NS" run smoke --rm -i --restart=Never --image=curlimages/curl -- \
              -sSI -H "Host: $INGRESS_HOST" \
              http://ingress-nginx-controller.ingress-nginx.svc.cluster.local/ | head -n1
          '''
        }
      }
    }
  }

  post {
    success { echo "✅ Deployed docker.io/$DOCKER_IMAGE:$TAG to namespace $K8S_NS" }
    failure { echo "❌ Build failed — check the first failing stage in Console Output" }
  }
}
