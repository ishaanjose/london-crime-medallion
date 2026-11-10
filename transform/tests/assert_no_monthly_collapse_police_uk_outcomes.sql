{{ config(severity='warn') }}

-- a force's police-stage outcome volume collapsing means missing data, not fewer outcomes
with monthly_totals as (
    select
        force,
        outcome_month as month,
        count(*) as outcome_count
    from {{ ref('police_uk__outcomes') }}
    where outcome_stage = 'police'
    group by 1, 2
),
with_baseline as (
    select
        force,
        month,
        outcome_count,
        avg(outcome_count) over (
            partition by force
            order by month
            rows between 3 preceding and 1 preceding
        ) as baseline
    from monthly_totals
),
unknown_gaps as (
    select
        current.force,
        current.month,
        current.outcome_count,
        current.baseline
    from with_baseline as current
    -- every known gap is skipped, whatever its severity
    left join {{ ref('known_outcome_gaps') }} as known
        on current.force = known.force
        and current.month between cast(known.start_month as date) and cast(known.end_month as date)
    where known.force is null
      and current.outcome_count < 0.5 * current.baseline
      -- City of London's few hundred rows a month are too noisy for a 50% rule,
      -- so in practice this watches the Met
      and current.baseline >= 5000
)
select
    force,
    month,
    outcome_count,
    baseline
from unknown_gaps
