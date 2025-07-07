# Starter Kit

## При старте нового проекта копируем этот репозиторий

В `pipelines/jira.yml` проверяем:
- поле tags - тег раннера 
    тег раннера можно узнать заглянув в Setting->CI/CD->Runners->Expand
    тег будет иметь вид формата projectname-deploy, должен совпадать с названием вашего проекта

- поле project  - проверяем ключ проекта , должен соответсвовать ключу из джиры 

В `pipelines/jira.yml` в пайплайне `move_resolved_to_rft` проверяем компоненты (удаляем не используемые, добавляем пропущенные)

В pipelines/staging.yml проверяем :
- поле tags  - соответсвует тегу раннера, вашего проекта 
- ключ -p в команду docker compose up  - должен соответствовать : -p project_name_${CI_COMMIT_REF_NAME}

В sonar-project.properties указываем:
- projectKey - ключ из сонаркуба, ключ можно уточнить у Devops отдела(@Fragile)

Удаляем этот блок из репозитория 

## Services
Information about `Services` can be found in  [services/README.md](./services/README.md)

## Deployment
Information about `Deployment` can be found in  [deploy/README.md](./deploy/README.md)
