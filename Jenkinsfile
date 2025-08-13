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
  containers:
  - name: node
    image: node:20-bullseye
    command: ['cat']
    tty: true
  - name: maven
    image: maven:3.9-eclipse-temurin-17
    command: ['cat']
    tty: true
      """
    }
  }

  options { timestamps() }
  triggers { githubPush() } // webhook

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

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

    stage('Package & Archive') {
      steps {
        sh 'rm -rf artifacts && mkdir -p artifacts'
        // Front: archive dossier dist si mawjoud
        sh 'tar -czf artifacts/frontend.tar.gz -C "employee frontend final" dist || true'
        // Back: copie jar si mawjoud
        sh 'cp emp_backend/target/*.jar artifacts/backend.jar 2>/dev/null || true'
        sh 'ls -lh artifacts || true'
        archiveArtifacts artifacts: 'artifacts/**', fingerprint: true
      }
    }
  }

  post {
    success { echo '✅ Build OK — artifacts archived (frontend/back).' }
    failure { echo '❌ Build failed — check the stage in Console Output.' }
  }
}
