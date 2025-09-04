// =======================
// Jenkinsfile (Declarative)
// =======================
pipeline {

  agent {
    kubernetes {
      cloud 'Kubernetes'         // assure l'usage du bon Cloud
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
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    resources:
      requests:
        cpu: "500m"
        memory: "1Gi"
      limits:
        cpu: "2"
        memory: "3Gi"
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
    command: ["cat"]
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
    command: ["/bin/sh","-c"]
    args: ["sleep 99d"]
    tty: true
    securityContext:
      runAsUser: 0
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
    }
  }

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    skipDefaultCheckout(true)
  }

  triggers { githubPush() }

  environment {
    DOCKER_IMAGE = 'adelbettaieb/gestionentreprise'
    K8S_NS       = 'jenkins'
    APP_NAME     = 'gestionentreprise'
    INGRESS_HOST = 'app.local'
  }

  stages {

    stage('Checkout') { steps { checkout scm } }

    stage('Init vars') {
      steps {
        script {
          def branch      = (env.BRANCH_NAME ?: 'main')
          def safeBranch  = branch.toLowerCase().replaceAll(/[^a-z0-9._-]/, '-')
          env.SAFE_BRANCH = safeBranch
          env.SHORT_SHA   = (env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : '')
          env.TAG         = (safeBranch == 'main') ? 'latest' : "${safeBranch}-${env.BUILD_NUMBER}"
          echo "Docker image => docker.io/${env.DOCKER_IMAGE}:${env.TAG}"
          echo "SHORT_SHA=${env.SHORT_SHA}"
        }
      }
    }

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
          dir('employee frontend final') {
            timeout(time: 25, unit: 'MINUTES') {
              sh '''
                set -eux
                export NG_CLI_ANALYTICS=false
                export CI=true
                # Donne plus de mémoire au process Node (Angular build)
                export NODE_OPTIONS="--max-old-space-size=3072"
                # Limite le parallélisme des workers esbuild pour éviter l'OOM
                export NG_BUILD_MAX_WORKERS=2

                npm ci || npm install
                # l'argument après -- est transmis à "ng build"
                npm run build -- --configuration=production --no-progress
              '''
            }
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
            set -euo pipefail
            CONTEXT_DIR="$WORKSPACE/emp_backend"
            DOCKERFILE="$CONTEXT_DIR/Dockerfile"

            test -d "$CONTEXT_DIR"
            test -f "$DOCKERFILE"

            echo ">> Push : ${DOCKER_IMAGE}:${TAG}"
            /kaniko/executor \
              --context "$CONTEXT_DIR" \
              --dockerfile "$DOCKERFILE" \
              --destination "docker.io/$DOCKER_IMAGE:$TAG" \
              --snapshot-mode=redo --verbosity=info

            if [ -n "${SHORT_SHA:-}" ]; then
              echo ">> Also push commit tag: $SHORT_SHA"
              /kaniko/executor \
                --context "$CONTEXT_DIR" \
                --dockerfile "$DOCKERFILE" \
                --destination "docker.io/$DOCKER_IMAGE:$SHORT_SHA" \
                --snapshot-mode=redo --verbosity=info
            fi

            if [ -n "${SAFE_BRANCH:-}" ] && [ "$SAFE_BRANCH" != "main" ]; then
              echo ">> Also push branch tag: $SAFE_BRANCH"
              /kaniko/executor \
                --context "$CONTEXT_DIR" \
                --dockerfile "$DOCKERFILE" \
                --destination "docker.io/$DOCKER_IMAGE:$SAFE_BRANCH" \
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

            DEPLOY_TAG="${SHORT_SHA:-$TAG}"
            echo "Deploying docker.io/$DOCKER_IMAGE:$DEPLOY_TAG"
            kubectl -n "$K8S_NS" set image deploy/$APP_NAME app="docker.io/$DOCKER_IMAGE:$DEPLOY_TAG"

            kubectl -n "$K8S_NS" rollout status deploy/$APP_NAME --timeout=420s
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
    success { echo "✅ Deployed docker.io/$DOCKER_IMAGE:${SHORT_SHA:-$TAG} to namespace $K8S_NS" }
    failure { echo "❌ Build failed — check the first failing stage in Console Output" }
  }
}
