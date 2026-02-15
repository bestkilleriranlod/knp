import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import axios from 'axios'

export default function BasicSelect({ onChange, defaultValue, id, disabled, isEditMode, existingCountry }) {
  // برای نمایش خطا
  const [errorMessage, setErrorMessage] = useState('')
  const [age, setAge] = useState(defaultValue)
  const [countries, setCountries] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (event) => {
    const selectedValue = event.target.value
    const selectedCountry = countries.find(c => c.name === selectedValue)
    
    // اگر در حالت ویرایش هستیم و کشور انتخابی همان کشور فعلی کاربر است، مهم نیست که پنل پر باشد
    if (isEditMode && selectedValue === existingCountry) {
      setErrorMessage('')
      setAge(selectedValue)
      if (onChange) {
        onChange(selectedValue)
      }
      return
    }
    
    // اگر کشور انتخابی پر شده باشد، خطا نمایش داده شود
    if (selectedCountry && selectedCountry.isFull) {
      setErrorMessage(`کشور ${selectedValue} ظرفیت کامل دارد و قابل انتخاب نیست`)
      return
    }
    
    // در غیر این صورت، مقدار انتخابی را تنظیم کن
    setErrorMessage('')
    setAge(selectedValue)
    if (onChange) {
      onChange(selectedValue)
    }
  }

  useEffect(() => {
    setAge(defaultValue)
  }, [defaultValue])
  
  useEffect(() => {
    async function fetchCountriesData() {
      setIsLoading(true)
      try {
        const access_token = sessionStorage.getItem("access_token")
        const agent = JSON.parse(sessionStorage.getItem("agent"))
        
        // دریافت پنل‌ها برای بررسی ظرفیت
        const panelsResponse = await axios.post("/get_panels", { access_token })
        const panels = Array.isArray(panelsResponse.data) ? panelsResponse.data : []
        
        // دریافت کاربران برای بررسی تعداد کاربران هر کشور
        const usersResponse = await axios.post("/get_users", { access_token })
        const users = usersResponse.data && usersResponse.data.obj_arr ? usersResponse.data.obj_arr : []
        
        // محاسبه تعداد کاربران هر کشور
        const countryUsersCount = {}
        users.forEach(user => {
          if (user.country) {
            if (!countryUsersCount[user.country]) {
              countryUsersCount[user.country] = 0
            }
            countryUsersCount[user.country]++
          }
        })
        
        // ایجاد آرایه کشورها با وضعیت پر بودن
        const countriesWithStatus = agent.country.split(",").map(country => {
          const panel = panels.find(p => p.panel_country === country)
          let isFull = false
          let spotsLeft = null
          
          if (panel) {
            // بررسی پر بودن پنل با استفاده از total_users و panel_user_max_count
            if (panel.total_users !== undefined && panel.panel_user_max_count) {
              isFull = panel.total_users >= panel.panel_user_max_count
              
              // محاسبه تعداد ظرفیت باقی‌مانده
              if (!isFull) {
                spotsLeft = panel.panel_user_max_count - panel.total_users
                // console.log(`Panel ${country}: total_users=${panel.total_users}, max=${panel.panel_user_max_count}, spotsLeft=${spotsLeft}`)
              } else {
                // console.log(`Panel ${country}: total_users=${panel.total_users}, max=${panel.panel_user_max_count}, isFull=${isFull}`)
              }
            }
            
            // بررسی غیرفعال بودن پنل
            if (panel.disable === true) {
              isFull = true
              spotsLeft = null
              // console.log(`Panel ${country}: disabled, marking as full`)
            }
            
            // بررسی اتمام ترافیک پنل
            if (panel.panel_traffic && panel.panel_data_usage && 
                panel.panel_traffic <= panel.panel_data_usage) {
              isFull = true
              spotsLeft = null
              // console.log(`Panel ${country}: out of traffic, marking as full`)
            }
          }
          
          return {
            name: country,
            isFull,
            spotsLeft
          }
        })
        
        // console.log('Final countries status:', countriesWithStatus)
        setCountries(countriesWithStatus)
      } catch (error) {
        console.error("Error fetching countries data:", error)
        // در صورت خطا، از اطلاعات کاربر استفاده می‌کنیم
        const agent = JSON.parse(sessionStorage.getItem("agent"))
        if (agent && agent.country) {
          setCountries(agent.country.split(",").map(country => ({ name: country, isFull: false })))
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchCountriesData()
  }, [])

  // فقط برای مواردی که اطلاعات کشورها هنوز بارگذاری نشده است از اطلاعات agent استفاده می‌کنیم
  const agent = JSON.parse(sessionStorage.getItem("agent"))

  return (
    <Box sx={{ width: '100%' }}>
      {errorMessage && (
        <div style={{ 
          color: 'red', 
          fontSize: '12px', 
          marginBottom: '4px',
          padding: '4px',
          backgroundColor: '#fff0f0',
          borderRadius: '4px',
          border: '1px solid #ffcccc'
        }}>
          {errorMessage}
        </div>
      )}
      <FormControl fullWidth error={!!errorMessage}>
        <InputLabel id="demo-simple-select-label">{isLoading ? 'Loading...' : ''}</InputLabel>
        <Select sx={{ height: 34 }}
          labelId="demo-simple-select-label"
          id={id}
          value={age}
          label={isLoading ? 'Loading...' : ''}
          onChange={handleChange}
          disabled={disabled}
        >
          {countries.length > 0 ? (
            countries.map((country) => (
              <MenuItem 
                key={country.name} 
                value={country.name}
                disabled={country.isFull && !(isEditMode && country.name === existingCountry)}
                sx={{
                  ...((country.isFull || (country.spotsLeft !== null && country.spotsLeft <= 20)) ? {
                    display: 'flex',
                    justifyContent: 'space-between',
                  } : {}),
                  ...(country.isFull ? {
                    opacity: 0.6,
                    backgroundColor: '#ffeeee !important',
                    color: '#888888',
                    cursor: 'not-allowed'
                  } : {})
                }}
              >
                {country.name}
                {country.isFull && (
                  <span style={{ 
                    marginLeft: '8px', 
                    color: '#ff5252',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    border: '1px solid #ff5252',
                    borderRadius: '3px',
                    background: '#fff0f0'
                  }}>FULL</span>
                )}
                {!country.isFull && country.spotsLeft !== null && country.spotsLeft <= 20 && (
                  <span style={{ 
                    marginLeft: '8px', 
                    color: '#ff9800',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    border: '1px solid #ff9800',
                    borderRadius: '3px',
                    background: '#fff9e6'
                  }}>{country.spotsLeft} LEFT</span>
                )}
              </MenuItem>
            ))
          ) : (
            agent && agent.country && agent.country.split(",").map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))
          )}
        </Select>
      </FormControl>
    </Box>
  )
}
