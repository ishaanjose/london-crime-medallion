{% macro borough_from_lsoa_name(column) %}
    regexp_replace({{ column }}, ' \d{3}[A-Z]$', '')
{% endmacro %}
