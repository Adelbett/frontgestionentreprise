// =======================
// Jenkinsfile (Declarative) — profil "RAM light" STABLE
// =======================
pipeline {

  agent {
    kubernetes {
      cloud 'Kubernetes'
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
    env:
    - name: NPM_CONFIG_CACHE
      value: /home/jenkins/.npm
    resources:
      requests: { cpu: "300m", memory: "768Mi" }
      limits:   { cpu: "1",    memory: "1536Mi" }
    volumeMounts:
    - { name: workspace-volume, mountPath: /home/jenkins/agent }
    - { name: npm-cache,       mountPath: /home/jenkins/.npm }

  - name: maven
    image: docker.io/library/maven:3.9-eclipse-temurin-17
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    workingDir: /home/jenkins/agent
    env:
    - { name: MAVEN_CONFIG, value: /home/jenkins/.m2 }
    resources:
      requests: { cpu: "300m", memory: "768Mi" }
      limits:   { cpu: "1",    memory: "1536Mi" }
    volumeMounts:
    - { name: workspace-volume, mountPath: /home/jenkins/agent }
    - { name: m2-cache,         mountPath: /home/jenkins/.m2 }

  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.23.2-debug
    imagePullPolicy: IfNotPresent
    command: ["cat"]
    tty: true
    env:
    - { name: DOCKER_CONFIG, value: /kaniko/.docker }
    workingDir: /home/jenkins/agent
    resources:
      requests: { cpu: "300m", memory: "1Gi" }
      limits:   { cpu: "1",    memory: "2Gi" }
    volumeMounts:
    - { name: docker-config,    mountPath: /kaniko/.docker }
    - { name: workspace-volume, mountPath: /home/jenkins/agent }

  - name: kubectl
    image: bitnami/kubectl:1.29-debian-12
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh","-c"]
    args: ["sleep 99d"]
    tty: true
    securityContext: { runAsUser: 0 }
    workingDir: /home/jenkins/agent
    volumeMounts:
    - { name: workspace-volume, mountPath: /home/jenkins/agent }

  volumes:
  - name: docker-config
    secret:
      secretName: regcred
      items:
      - { key: .dockerconfigjson, path: config.json }

  - name: workspace-volume
    emptyDir: {}

  - name: npm-cache
    emptyDir: {}          # cache npm

  - name: m2-cache
    emptyDir: {}          # cache Maven
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
          sh 'set -x; whoami || true; pwd; ls -ld .; df -h; free -m'
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
        retry(2) {
          timeout(time: 25, unit: 'MINUTES') {
            container('node') {
              dir('employee frontend final') {
                sh '''
                  set -eux
                  export NG_CLI_ANALYTICS=false
                  export CI=true
                  export NODE_OPTIONS="--max-old-space-size=1536"
                  export NG_BUILD_MAX_WORKERS=1

                  npm config set fund false
                  npm ci --prefer-offline --no-audit --progress=false || \
                  npm install --prefer-offline --no-audit --progress=false

                  npm run build -- --configuration=production --no-progress
                '''
              }
            }
          }
        }
      }
    }

    stage('Build Backend (Maven)') {
      steps {
        retry(2) {
          timeout(time: 35, unit: 'MINUTES') {
            container('maven') {
              dir('emp_backend') {
                sh '''
                  set -eux
                  export MAVEN_OPTS="-Xms256m -Xmx1024m -XX:+UseSerialGC -Djava.awt.headless=true"
                  MVN_COMMON="-B -Dmaven.repo.local=$MAVEN_CONFIG \
                    -Dhttp.keepAlive=false -Dmaven.wagon.http.pool=false \
                    -Dmaven.wagon.http.retryHandler.count=3"

                  if [ -x ./mvnw ]; then
                    ./mvnw  $MVN_COMMON -DskipTests package
                  else
                    mvn     $MVN_COMMON -DskipTests package
                  fi
                '''
              }
            }
          }
        }
      }
    }

    stage('Build & Push Image (Kaniko)') {
      steps {
        retry(2) {
          timeout(time: 30, unit: 'MINUTES') {
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
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        retry(2) {
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
    }

    stage('Smoke Test (Ingress)') {
      steps {
        retry(2) {
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
  }

  post {
    success { echo "✅ Deployed docker.io/$DOCKER_IMAGE:${SHORT_SHA:-$TAG} to namespace $K8S_NS" }
    failure { echo "❌ Build failed — check the first failing stage in Console Output" }
    always  { cleanWs() }
  }
}
