-- 코드를 작성해주세요
SELECT
            ID,
            CASE
                WHEN RANK() OVER (ORDER BY SIZE_OF_COLONY DESC)
                    <= COUNT(*) OVER() * 0.25 THEN 'CRITICAL'
                WHEN RANK() OVER (ORDER BY SIZE_OF_COLONY DESC)
                    <= COUNT(*) OVER() * 0.50 THEN 'HIGH'
                WHEN RANK() OVER (ORDER BY SIZE_OF_COLONY DESC)
                    <= COUNT(*) OVER() * 0.75 THEN 'MEDIUM'
                ELSE 'LOW'
            END as COLONY_NAME
FROM        ECOLI_DATA
ORDER BY    ID ASC;